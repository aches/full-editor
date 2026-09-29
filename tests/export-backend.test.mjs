import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] })).href)
const sandbox = await fs.mkdtemp(join(tmpdir(), 'editor-export-'))
const source = join(sandbox, 'source.md')
await fs.writeFile(source, '# Source')
const entry = join(sandbox, 'export-backend.mjs')
await build({
  stdin: {
    contents: `export * from './src/main/services/export-service'; export { fixture } from 'electron';`,
    resolveDir: resolve('.'), loader: 'ts'
  },
  outfile: entry, bundle: true, platform: 'node', format: 'esm', tsconfig: 'tsconfig.node.json',
  plugins: [{ name: 'export-native-fixture', setup(builder) {
    builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }))
    builder.onResolve({ filter: /^\.\.\/window$/ }, () => ({ path: 'window', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
      contents: path === 'window' ? `import { fixture } from 'electron'; export const mainWindow = () => fixture.owner;` : `
        import { EventEmitter } from 'node:events';
        export const fixture = { owner: { isDestroyed: () => false }, windows: [], dialogs: [], width: 1000, height: 1240,
          savePath: null, assetError: false, captureWidth: 2000, captureHeight: null, loadGate: null, onReplace: null };
        export class BrowserWindow {
          constructor(options) {
            this.options = options;
            this.destroyed = false;
            this.webContents = new EventEmitter();
            this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler };
            this.webContents.executeJavaScript = async script => {
              if (script.includes('document.fonts.ready')) this.script = script;
              if (fixture.assetError) throw new Error('broken image');
              return { width: fixture.width, height: fixture.height };
            };
            this.webContents.printToPDF = async options => {
              this.pdfOptions = options;
              return Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 255]);
            };
            this.commands = [];
            this.webContents.debugger = {
              attach: () => {},
              sendCommand: async (command, options) => {
                this.commands.push({ command, options });
                if (command === 'Page.captureScreenshot') fixture.clip = options.clip;
                return command === 'Page.captureScreenshot' ? { data: Buffer.from([137, 80, 78, 71, 0, 255]).toString('base64') } : {};
              }
            };
            fixture.windows.push(this);
          }
          async loadURL(url) { this.url = url; if (fixture.loadGate) await fixture.loadGate; }
          isDestroyed() { return this.destroyed; }
          destroy() { this.destroyed = true; }
        }
        export const nativeImage = { createFromBuffer: () => ({ isEmpty: () => false,
          getSize: () => ({ width: fixture.captureWidth, height: fixture.captureHeight ?? fixture.clip.height * 2 }),
          toBitmap: () => Buffer.alloc(fixture.clip.width * fixture.clip.height * 16, Math.floor(fixture.clip.y / 2048) + 1)
        }), createFromBitmap: (pixels, options) => {
          fixture.assembled = { pixels, options };
          return { toPNG: () => Buffer.from([137, 80, 78, 71, 0, 255]) };
        } };
        export const dialog = {
          showSaveDialog: async (owner, options) => {
            fixture.dialogs.push(options);
            return { canceled: !fixture.savePath, filePath: fixture.savePath };
          },
          showMessageBox: async () => { await fixture.onReplace?.(); return { response: 1 }; }
        };`, loader: 'js'
    }))
  }}]
})
const { exportDocument, fixture } = await import(pathToFileURL(entry).href)
after(async () => { await fs.rm(sandbox, { recursive: true, force: true }) })

function prepare(format = 'png') {
  Object.assign(fixture, { windows: [], dialogs: [], width: 1000, height: 1240,
    savePath: join(sandbox, `output.${format}`), assetError: false, captureWidth: 2000, captureHeight: null, loadGate: null, onReplace: null })
  return { format, sourcePath: source, html: '<h1>Document</h1>', css: 'body { margin: 0; }', forbiddenPaths: [] }
}

test('PNG capture is complete, binary-safe, sandboxed and finished before chooser', async () => {
  const request = prepare()
  request.css += '\n/* </style><script>alert(1)</script> */'
  const result = await exportDocument(request)
  assert.equal(result.ok, true)
  assert.deepEqual(await fs.readFile(result.path), Buffer.from([137, 80, 78, 71, 0, 255]))
  const win = fixture.windows[0]
  assert.equal(win.destroyed, true)
  assert.equal(win.options.webPreferences.nodeIntegration, false)
  assert.equal(win.options.webPreferences.sandbox, true)
  assert.equal(win.options.webPreferences.preload, undefined)
  const page = decodeURIComponent(win.url.slice(win.url.indexOf(',') + 1))
  assert.match(page, /default-src 'none'/)
  assert.match(page, /img-src data: editor-file:/)
  assert.match(page, /script-src 'none'/)
  assert.match(page, /<title>source.md<\/title>/)
  assert.doesNotMatch(page, /<script>/)
  assert.deepEqual(win.openHandler({}), { action: 'deny' })
  assert.match(win.script, /document.fonts.ready/)
  assert.match(win.script, /image.decode/)
  const screenshot = win.commands.find((command) => command.command === 'Page.captureScreenshot').options
  const metrics = win.commands.find((command) => command.command === 'Emulation.setDeviceMetricsOverride').options
  assert.equal(metrics.deviceScaleFactor, 2)
  assert.equal(metrics.width, 1000)
  assert.equal(screenshot.clip.scale, 1)
  assert.equal(screenshot.captureBeyondViewport, true)
  assert.equal(screenshot.clip.height, 1240)
  assert.equal(screenshot.clip.width, 1000)
  assert.equal(fixture.dialogs[0].defaultPath, join(sandbox, 'source-export.png'))
})

test('PDF uses printable backgrounds, A4, CSS page size and binary output', async () => {
  const result = await exportDocument(prepare('pdf'))
  assert.equal(result.ok, true)
  assert.deepEqual(await fs.readFile(result.path), Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 255]))
  assert.deepEqual(fixture.windows[0].pdfOptions, { pageSize: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false })
  assert.equal(fixture.windows[0].destroyed, true)
})

test('long PNG stitches full-density strips in order, including the partial last strip', async () => {
  const request = prepare()
  fixture.height = 4501
  assert.equal((await exportDocument(request)).ok, true)
  const captures = fixture.windows[0].commands.filter(command => command.command === 'Page.captureScreenshot')
  assert.deepEqual(captures.map(command => [command.options.clip.y, command.options.clip.height]), [[0, 2048], [2048, 2048], [4096, 405]])
  assert.deepEqual(fixture.assembled.options, { width: 2000, height: 9002, scaleFactor: 1 })
  const pixels = fixture.assembled.pixels
  const stride = 2000 * 4
  assert.equal(pixels.length, stride * 9002)
  for (const [row, value] of [[0, 1], [4095, 1], [4096, 2], [8191, 2], [8192, 3], [9001, 3]]) {
    assert.equal(pixels[row * stride], value)
    assert.equal(pixels[(row + 1) * stride - 1], value)
  }
})

test('render errors and clipped/oversized PNG never open chooser or touch destination', async () => {
  for (const failure of [{ assetError: true }, { height: 16001 }, { captureHeight: 600 }, { captureWidth: 1000 }, { width: 1200 }]) {
    const request = prepare()
    Object.assign(fixture, failure)
    await fs.writeFile(fixture.savePath, 'keep existing')
    const result = await exportDocument(request)
    assert.equal(result.ok, false)
    assert.equal(result.code, failure.assetError ? 'ASSET_LOAD_FAILED' : 'USE_PDF')
    assert.equal(fixture.dialogs.length, 0)
    assert.equal(await fs.readFile(fixture.savePath, 'utf8'), 'keep existing')
    assert.equal(fixture.windows[0].destroyed, true)
  }
})

test('source and another open file are protected through canonical aliases', async () => {
  const request = prepare()
  const alias = join(sandbox, 'source-alias.png')
  await fs.symlink(source, alias)
  fixture.savePath = alias
  assert.equal((await exportDocument(request)).code, 'PROTECTED_PATH')
  assert.equal(await fs.readFile(source, 'utf8'), '# Source')
  const other = join(sandbox, 'other.md')
  await fs.writeFile(other, 'other tab')
  request.forbiddenPaths = [other]
  fixture.savePath = other
  assert.equal((await exportDocument(request)).code, 'PROTECTED_PATH')
  assert.equal(await fs.readFile(other, 'utf8'), 'other tab')
})

test('external destination edit during replacement confirmation prevents overwrite', async () => {
  const request = prepare('pdf')
  await fs.writeFile(fixture.savePath, 'original')
  fixture.onReplace = () => fs.writeFile(fixture.savePath, 'external change')
  const result = await exportDocument(request)
  assert.equal(result.code, 'CONFLICT')
  assert.equal(await fs.readFile(fixture.savePath, 'utf8'), 'external change')
  assert.equal((await fs.readdir(sandbox)).filter(name => name.endsWith('.tmp')).length, 0)
})

test('cancellation, invalid requests and duplicate in-flight exports are safe', async () => {
  const request = prepare()
  fixture.savePath = null
  assert.equal((await exportDocument(request)).code, 'CANCELLED')
  assert.equal(fixture.windows[0].destroyed, true)
  assert.equal((await exportDocument({ ...request, format: 'svg' })).code, 'INVALID_EXPORT')
  let release
  fixture.loadGate = new Promise(resolve => { release = resolve })
  const first = exportDocument(request)
  assert.equal((await exportDocument(request)).code, 'EXPORT_BUSY')
  release()
  assert.equal((await first).code, 'CANCELLED')
  fixture.loadGate = null
  assert.equal((await exportDocument(request)).code, 'CANCELLED')
})
