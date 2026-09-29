const { app, BrowserWindow, dialog, nativeImage, Menu } = require('electron')
const fs = require('node:fs/promises')
const syncFs = require('node:fs')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const directory = process.env.EDITOR_SMOKE_DIR
const qa = process.env.EDITOR_EXPORT_QA_DIR || join(directory, 'qa')
app.setPath('userData', join(directory, 'profile'))
let savePath
let chooserCount = 0
let overwriteDecision = 1
const chooserOptions = []
dialog.showSaveDialog = async (_win, options) => {
  chooserCount++
  chooserOptions.push(options)
  return { canceled: !savePath, filePath: savePath }
}
dialog.showMessageBox = async () => ({ response: overwriteDecision })
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
let win
const errors = []
async function evaluate(source) { return win.webContents.executeJavaScript(source) }
async function until(source) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if (await evaluate(source)) return } catch {}
    await delay(50)
  }
  throw new Error(`Timed out: ${source}; renderer errors: ${errors.join('; ')}`)
}
async function request(format) {
  return evaluate(`(async () => {
    const s = window.__store.getState();
    const { buildExportRequest } = await import('/src/lib/export-document.ts');
    const { currentDoc } = await import('/src/editor/doc-registry.ts');
    return buildExportRequest(s.activeTab(), currentDoc(s.activeTabId), ${JSON.stringify(format)}, s.tabs.map(t => t.path));
  })()`)
}
async function exportCurrent(format) {
  return evaluate(`import('/src/lib/export-document.ts').then(m => m.exportTab(${JSON.stringify(format)}))`)
}
const timeout = setTimeout(() => { console.error('Export smoke timeout'); app.exit(1) }, 120000)
;(async () => {
  const notes = join(directory, 'notes')
  syncFs.mkdirSync(notes, { recursive: true })
  syncFs.mkdirSync(qa, { recursive: true })
  const markdown = join(notes, '说明.md')
  syncFs.writeFileSync(markdown, '# Original on disk\n')
  syncFs.writeFileSync(join(notes, 'asset #.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="64"><rect width="220" height="64" rx="10" fill="#307a68"/><text x="20" y="40" fill="white" font-size="24">Local asset</text></svg>')
  require(resolve('out/main/index.js'))
  app.on('will-quit', (event) => event.preventDefault())
  await app.whenReady()
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await delay(50)
  win = BrowserWindow.getAllWindows()[0]
  win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message) })
  await until('window.__store?.getState().sessionReady')
  await evaluate(`window.__store.getState().createProject('Export checks')`)
  await evaluate(`window.__store.getState().addRootPaths([${JSON.stringify(notes)}])`)
  await evaluate(`window.__store.getState().openFile(${JSON.stringify(markdown)}, '说明.md')`)
  await until(`import('/src/editor/doc-registry.ts').then(m => m.liveView && m.activeDocTabId === window.__store.getState().activeTabId)`)
  const source = '# 导出预览 / Export preview\n\n未保存的 **粗体内容** 与中文排版。\n\n![Local asset](asset%20%23.svg)\n\n| 项目 | 状态 |\n| --- | --- |\n| 图片 | 完整长图 |\n| PDF | 自动分页 |\n\n- First item\n- 第二项\n\n```js\nconst message = "hello";\n```\n\n' +
    Array.from({ length: 35 }, (_, i) => `## Section ${i + 1}\n\n这是第 ${i + 1} 段内容。Export the whole document, including content below the current viewport.\n`).join('\n') + '\nEXPORT_END_MARKER\n'
  await evaluate(`import('/src/editor/doc-registry.ts').then(({liveView}) => liveView.dispatch({ changes: { from: 0, to: liveView.state.doc.length, insert: ${JSON.stringify(source)} } }))`)
  const tabId = await evaluate('window.__store.getState().activeTabId')
  const firstRequest = await request('png')
  assert.ok(firstRequest.html.includes('<h1>导出预览 / Export preview</h1>'), firstRequest.html.slice(0, 500))
  assert.ok(firstRequest.html.includes('EXPORT_END_MARKER'))
  assert.ok(firstRequest.html.includes('editor-file://local'))
  assert.equal(firstRequest.html.includes('export-code'), false)
  assert.equal(await evaluate(`window.__store.getState().mdViewByTab[${JSON.stringify(tabId)}] ?? 'edit'`), 'edit')
  savePath = join(qa, 'markdown.png')
  assert.equal(await exportCurrent('png'), true, errors.join('\n'))
  const png = nativeImage.createFromBuffer(await fs.readFile(savePath))
  assert.equal(png.getSize().width, 2000)
  assert.ok(png.getSize().height > 2000)
  await fs.writeFile(join(qa, 'markdown-detail.png'), png.crop({ x: 80, y: 72, width: 1100, height: 500 }).toPNG())
  assert.equal(await fs.readFile(markdown, 'utf8'), '# Original on disk\n')
  assert.equal(await evaluate('window.__store.getState().activeTab().dirty'), true)
  assert.ok(chooserOptions.at(-1).defaultPath.endsWith('说明-export.png'))
  console.log('PASS Markdown uses live preview from edit mode; full-height PNG, local image and dirty state preserved')
  savePath = join(qa, 'markdown.pdf')
  assert.equal(await exportCurrent('pdf'), true)
  assert.equal((await fs.readFile(savePath)).subarray(0, 5).toString(), '%PDF-')
  console.log('PASS full Markdown PDF produced with UTF-8 content and paginated layout')
  // The toolbar exposes both formats without changing the current document mode.
  await evaluate(`document.querySelector('[aria-label="Export file"]').click()`)
  await until('document.querySelector("[role=menu]")?.textContent.includes("PNG Image")')
  await delay(250)
  await fs.writeFile(join(qa, 'export-menu.png'), (await win.webContents.capturePage()).toPNG())
  savePath = join(qa, 'toolbar.png')
  await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.includes('PNG Image')).click()`)
  await until('window.__store.getState().exporting')
  await until('!window.__store.getState().exporting')
  assert.ok((await fs.stat(savePath)).size > 0)
  savePath = join(qa, 'native-menu.pdf')
  Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items
    .find(item => item.label === 'Export').submenu.items.find(item => item.label === 'PDF Document…').click()
  await until('window.__store.getState().exporting')
  await until('!window.__store.getState().exporting')
  assert.equal((await fs.readFile(savePath)).subarray(0, 5).toString(), '%PDF-')
  savePath = undefined
  assert.equal(await exportCurrent('pdf'), false)
  assert.equal(await evaluate('window.__store.getState().exporting'), false)
  assert.equal(BrowserWindow.getAllWindows().length, 1)
  console.log('PASS toolbar actions, cancel feedback and hidden-window cleanup')
  // SVG export uses the unsaved buffer even when the code viewer is selected.
  const svgPath = join(notes, 'drawing.svg')
  await fs.writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200"><rect width="640" height="200" fill="blue"/></svg>')
  await evaluate(`window.__store.getState().openFile(${JSON.stringify(svgPath)}, 'drawing.svg')`)
  await until('window.__store.getState().activeTab()?.name === "drawing.svg" && document.querySelector(".cm-content")')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200"><rect width="640" height="200" fill="#12a987"/><text x="35" y="70" font-size="36" fill="white">Live SVG preview</text></svg>'
  await evaluate(`import('/src/editor/doc-registry.ts').then(({liveView}) => liveView.dispatch({ changes: { from: 0, to: liveView.state.doc.length, insert: ${JSON.stringify(svg)} } }))`)
  savePath = join(qa, 'svg.png')
  assert.equal(await exportCurrent('png'), true)
  const svgPng = nativeImage.createFromBuffer(await fs.readFile(savePath))
  const bitmap = svgPng.toBitmap()
  const offset = (300 * svgPng.getSize().width + 1000) * 4
  assert.ok(Math.abs(bitmap[offset + 1] - 169) < 8, 'SVG should contain the unsaved green rectangle, not disk blue')
  assert.ok((await fs.readFile(svgPath, 'utf8')).includes('blue'))
  console.log('PASS SVG exports preview of unsaved buffer without saving or switching modes')
  const raster = join(notes, 'raster #%20?.png')
  await fs.copyFile(savePath, raster)
  await evaluate(`window.__store.getState().openFile(${JSON.stringify(raster)}, 'raster #%20?.png')`)
  await until('document.querySelector("img")?.naturalWidth > 0')
  savePath = join(qa, 'image.pdf')
  assert.equal(await exportCurrent('pdf'), true)
  console.log('PASS image default view exports despite spaces and # in filename')
  const codePath = join(notes, 'sample.js')
  await fs.writeFile(codePath, 'const message = "<script>not executable</script>";\nconsole.log(message);\n')
  await evaluate(`window.__store.getState().openFile(${JSON.stringify(codePath)}, 'sample.js')`)
  const codeRequest = await request('png')
  assert.ok(codeRequest.html.includes('export-code'))
  assert.ok(codeRequest.html.includes('&lt;script&gt;'))
  assert.ok(codeRequest.html.includes('<span class='))
  savePath = join(qa, 'code.png')
  assert.equal(await exportCurrent('png'), true)
  console.log('PASS default code export keeps syntax highlighting and escapes source markup')
  // Large single images fail before any chooser/write; the same source remains exportable as PDF.
  const huge = Array.from({ length: 900 }, (_, i) => `const row${i} = ${i};`).join('\n') + '\nLONG_DOCUMENT_END'
  await evaluate(`import('/src/editor/doc-registry.ts').then(({liveView}) => liveView.dispatch({ changes: { from: 0, to: liveView.state.doc.length, insert: ${JSON.stringify(huge)} } }))`)
  const tooLarge = await request('png')
  const beforeChooser = chooserCount
  const oversized = await evaluate(`window.api.export.document(${JSON.stringify(tooLarge)})`)
  assert.equal(oversized.code, 'USE_PDF')
  assert.equal(chooserCount, beforeChooser)
  savePath = join(qa, 'long-code.pdf')
  assert.equal(await exportCurrent('pdf'), true)
  console.log('PASS oversized PNG cannot silently truncate; long code PDF succeeds')
  // At the existing layout limit, 2x density must still include the last pixel.
  savePath = join(qa, 'maximum-height.png')
  const maximum = { ...firstRequest, html: '<div></div>',
    css: 'html,body{margin:0;width:1000px;height:16000px;background:white}div{position:absolute;top:15990px;left:0;width:1000px;height:10px;background:#12a987}' }
  assert.equal((await evaluate(`window.api.export.document(${JSON.stringify(maximum)})`)).ok, true)
  const maximumPng = nativeImage.createFromBuffer(await fs.readFile(savePath))
  assert.deepEqual(maximumPng.getSize(), { width: 2000, height: 32000 })
  const lastPixel = maximumPng.crop({ x: 1000, y: 31999, width: 1, height: 1 }).toBitmap()
  assert.ok(Math.abs(lastPixel[1] - 169) < 8, 'The bottom edge must be rendered at full 2x density')
  console.log('PASS 2000 × 32000 PNG retains 2x density and the last content pixel')
  // Asset failure must leave even an existing destination untouched.
  await evaluate(`window.__store.getState().activateTab(${JSON.stringify(tabId)})`)
  await evaluate(`import('/src/editor/doc-registry.ts').then(({liveView}) => liveView.dispatch({ changes: { from: 0, to: liveView.state.doc.length, insert: ${JSON.stringify('# Missing image\n\n![missing](absent.png)')} } }))`)
  savePath = join(qa, 'unchanged.pdf')
  await fs.writeFile(savePath, 'keep existing destination')
  const brokenRequest = await request('pdf')
  const broken = await evaluate(`window.api.export.document(${JSON.stringify(brokenRequest)})`)
  assert.equal(broken.code, 'ASSET_LOAD_FAILED')
  assert.equal(await fs.readFile(savePath, 'utf8'), 'keep existing destination')
  assert.equal(BrowserWindow.getAllWindows().length, 1)
  console.log('PASS missing assets fail explicitly and preserve destination')
  assert.equal(errors.filter((message) => !message.includes('Failed to load resource')).length, 0, errors.join('\n'))
  console.log(`Export QA files: ${qa}`)
  clearTimeout(timeout)
  app.exit(0)
})().catch((error) => { console.error(error, errors); clearTimeout(timeout); app.exit(1) })
