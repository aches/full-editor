import { BrowserWindow, dialog, nativeImage } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import type { ExportRequest, ExportResult } from '@shared/types'
import { atomicWrite, fileRevision, serializeWrite } from './atomic-write'
import { mainWindow } from '../window'

const EXPORT_WIDTH = 1000
const PNG_PIXEL_RATIO = 2
const PNG_TILE_HEIGHT = 2048
const MAX_PNG_LAYOUT_HEIGHT = 16000
const MAX_PNG_PIXELS = 64_000_000
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024
let exporting = false

/** File aliases, including a missing file below an existing symlinked directory. */
async function exportDestination(path: string): Promise<string> {
  try {
    return await fs.realpath(resolve(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return join(await fs.realpath(dirname(resolve(path))), basename(path))
  }
}

/** Only this fixed script runs; document scripts are prohibited by the CSP. */
const WAIT_FOR_ASSETS = `
(async () => {
  let timeout;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.ready,
        ...Array.from(document.images, async image => {
          image.loading = 'eager';
          if (!image.complete) await new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', () => reject(new Error('An image could not be loaded.')), { once: true });
          });
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('An image could not be loaded.');
          await image.decode();
        })
      ]),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Images or fonts took too long to load.')), 15000); })
    ]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)),
      width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)) };
  } finally {
    clearTimeout(timeout);
  }
})()
`

export async function exportDocument(request: ExportRequest): Promise<ExportResult> {
  if (!request || !['png', 'pdf'].includes(request.format) || typeof request.html !== 'string' ||
    typeof request.css !== 'string' || typeof request.sourcePath !== 'string' || !isAbsolute(request.sourcePath) ||
    !Array.isArray(request.forbiddenPaths) || request.forbiddenPaths.length > 1000 ||
    !request.forbiddenPaths.every((path) => typeof path === 'string' && isAbsolute(path)) ||
    Buffer.byteLength(request.html) + Buffer.byteLength(request.css) > MAX_DOCUMENT_BYTES) {
    return { ok: false, code: 'INVALID_EXPORT', message: 'Invalid or oversized export document (maximum 32 MiB).' }
  }
  if (exporting) return { ok: false, code: 'EXPORT_BUSY', message: 'Another export is already in progress.' }
  const owner = mainWindow()
  if (!owner || owner.isDestroyed()) return { ok: false, code: 'CANCELLED', message: 'The editor window is closed.' }
  exporting = true
  let renderWindow: BrowserWindow | null = null
  let timeout: NodeJS.Timeout | null = null
  try {
    const render = async (): Promise<Buffer> => {
      const win = new BrowserWindow({
        show: false, width: EXPORT_WIDTH, height: 600, useContentSize: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
          webSecurity: true, webviewTag: false, backgroundThrottling: false,
          navigateOnDragDrop: false, spellcheck: false
        }
      })
      renderWindow = win
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-navigate', (event) => event.preventDefault())
      win.webContents.on('will-redirect', (event) => event.preventDefault())
      const csp = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: editor-file:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
      // Escape '<' in CSS so even a malformed style cannot close its own element.
      const css = request.css.replace(/</g, '\\3c ')
      const title = basename(request.sourcePath).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const page = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${title}</title><style>${css}</style></head><body>${request.html}</body></html>`
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
      if (request.format === 'png') {
        // A one-pixel layout viewport measures natural content height without the
        // native window/screen height affecting short documents or clipping tall ones.
        win.webContents.debugger.attach('1.3')
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width: EXPORT_WIDTH, height: 1, deviceScaleFactor: PNG_PIXEL_RATIO, mobile: false
        })
      }
      let dimensions: { width: number; height: number }
      try {
        dimensions = await win.webContents.executeJavaScript(WAIT_FOR_ASSETS)
      } catch (error) {
        throw Object.assign(new Error(`Export could not load every image or font. ${String(error)}`), { code: 'ASSET_LOAD_FAILED' })
      }
      if (request.format === 'pdf') {
        return await win.webContents.printToPDF({
          pageSize: 'A4', printBackground: true, preferCSSPageSize: true,
          displayHeaderFooter: false
        })
      }
      const height = dimensions.height
      // Rasterize text at retina density without changing wrapping or upscaling
      // an existing bitmap. Limits and verification use the final physical pixels.
      const pixelWidth = EXPORT_WIDTH * PNG_PIXEL_RATIO
      const pixelHeight = height * PNG_PIXEL_RATIO
      if (!Number.isFinite(height) || height <= 0 || height > MAX_PNG_LAYOUT_HEIGHT ||
        pixelHeight * pixelWidth > MAX_PNG_PIXELS || dimensions.width > EXPORT_WIDTH) {
        throw Object.assign(new Error('This document is too large for one PNG image. Export it as PDF instead.'), { code: 'USE_PDF' })
      }
      // Paint bounded strips to avoid Chromium/GPU limits on tall raster surfaces.
      // Copy their original pixels into one PNG, with no resizing or resampling.
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: EXPORT_WIDTH, height: Math.min(height, PNG_TILE_HEIGHT), deviceScaleFactor: PNG_PIXEL_RATIO, mobile: false
      })
      const pixels = height > PNG_TILE_HEIGHT ? Buffer.alloc(pixelWidth * pixelHeight * 4) : null
      for (let y = 0; y < height; y += PNG_TILE_HEIGHT) {
        const tileHeight = Math.min(PNG_TILE_HEIGHT, height - y)
        await win.webContents.executeJavaScript(`window.scrollTo(0, ${y}); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
        const screenshot = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
          format: 'png', fromSurface: true, captureBeyondViewport: true,
          clip: { x: 0, y, width: EXPORT_WIDTH, height: tileHeight, scale: 1 }
        }) as { data: string }
        const png = Buffer.from(screenshot.data, 'base64')
        const image = nativeImage.createFromBuffer(png)
        const size = image.getSize()
        if (image.isEmpty() || size.width !== pixelWidth || size.height !== tileHeight * PNG_PIXEL_RATIO) {
          throw Object.assign(new Error('The complete image could not be captured. Export as PDF instead.'), { code: 'USE_PDF' })
        }
        if (!pixels) return png
        const bitmap = image.toBitmap()
        if (bitmap.length !== pixelWidth * tileHeight * PNG_PIXEL_RATIO * 4) {
          throw Object.assign(new Error('The complete image could not be captured. Export as PDF instead.'), { code: 'USE_PDF' })
        }
        bitmap.copy(pixels, y * PNG_PIXEL_RATIO * pixelWidth * 4)
      }
      return nativeImage.createFromBitmap(pixels!, { width: pixelWidth, height: pixelHeight, scaleFactor: 1 }).toPNG()
    }
    const data = await Promise.race([
      render(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('Export rendering timed out. Try a smaller document or PDF.'), { code: 'EXPORT_TIMEOUT' })), 45000)
      })
    ])
    if (timeout) clearTimeout(timeout)
    timeout = null
    if (renderWindow && !(renderWindow as BrowserWindow).isDestroyed()) (renderWindow as BrowserWindow).destroy()
    renderWindow = null
    if (owner.isDestroyed()) return { ok: false, code: 'CANCELLED', message: 'The editor window was closed.' }

    const name = basename(request.sourcePath, extname(request.sourcePath)) || 'document'
    const choice = await dialog.showSaveDialog(owner, {
      title: request.format === 'pdf' ? 'Export PDF Document' : 'Export PNG Image',
      defaultPath: join(dirname(request.sourcePath), `${name}-export.${request.format}`),
      buttonLabel: 'Export', filters: [{ name: request.format === 'pdf' ? 'PDF Document' : 'PNG Image', extensions: [request.format] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })
    if (choice.canceled || !choice.filePath) return { ok: false, code: 'CANCELLED', message: 'Export cancelled.' }
    const destination = await exportDestination(choice.filePath)
    for (const path of [request.sourcePath, ...request.forbiddenPaths]) {
      const forbidden = await exportDestination(path).catch(() => resolve(path))
      if (forbidden === destination) return { ok: false, code: 'PROTECTED_PATH', message: 'Export cannot replace the source document or another open file. Choose a different destination.' }
    }
    const revision = await fileRevision(destination)
    if (revision !== null) {
      // Capture revision before this final confirmation, so edits while the user
      // decides (or while the temporary output is written) cannot be overwritten.
      const overwrite = await dialog.showMessageBox(owner, {
        type: 'warning', title: 'Replace exported file?', message: `Replace “${basename(destination)}”?`,
        detail: 'The existing file will be replaced by this export.',
        buttons: ['Cancel', 'Replace'], defaultId: 0, cancelId: 0, noLink: true
      })
      if (overwrite.response !== 1) return { ok: false, code: 'CANCELLED', message: 'Export replacement cancelled.' }
    }
    await serializeWrite(destination, async () => {
      await atomicWrite(destination, data, async () => {
        if (await fileRevision(destination) !== revision) {
          throw Object.assign(new Error('The export destination changed after it was selected. Export again to review the current file.'), { code: 'CONFLICT' })
        }
      })
    })
    return { ok: true, path: destination }
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'EXPORT_FAILED', message: e.message ?? String(error) }
  } finally {
    if (timeout) clearTimeout(timeout)
    if (renderWindow && !(renderWindow as BrowserWindow).isDestroyed()) (renderWindow as BrowserWindow).destroy()
    exporting = false
  }
}
