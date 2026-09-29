import { after, test } from 'node:test'
import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] })).href)

const sandbox = await fs.mkdtemp(join(tmpdir(), 'editor-reliability-'))
const userData = join(sandbox, 'user-data')
const root = join(sandbox, 'project')
await fs.mkdir(userData)
await fs.mkdir(root)
const entry = join(sandbox, 'backend.mjs')
await build({
  stdin: {
    contents: `export * from './src/main/services/atomic-write'; export * from './src/main/services/session-store'; export * from './src/main/services/fs-service'; export * from './src/main/services/project-store'; export * from './src/main/services/file-grants'; export * from './src/main/lifecycle'; export { setSavePath, app as testApp } from 'electron';`,
    resolveDir: resolve('.'), loader: 'ts'
  },
  outfile: entry, bundle: true, platform: 'node', format: 'esm', tsconfig: 'tsconfig.node.json',
  plugins: [{ name: 'native-dialog-fixture', setup(builder) {
    builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }))
    builder.onResolve({ filter: /^\.\.\/window$/ }, () => ({ path: 'window', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
      contents: path === 'window' ? 'export const mainWindow = () => ({});' : `
        import { EventEmitter } from 'node:events';
        let savePath;
        export const setSavePath = (path) => { savePath = path };
        export const app = new EventEmitter();
        app.getPath = () => ${JSON.stringify(userData)};
        app.quitCalls = 0;
        app.quit = () => {
          const event = { prevented: false, preventDefault() { this.prevented = true } };
          app.emit('before-quit', event);
          if (!event.prevented) app.quitCalls++;
        };
        export const shell = {};
        export const dialog = {
          showSaveDialog: async () => ({ canceled: !savePath, filePath: savePath }),
          showMessageBox: async () => ({ response: 1 })
        };`, loader: 'js'
    }))
  }}]
})
const backend = await import(pathToFileURL(entry).href)
await backend.loadProjects()
const project = backend.createProject('Reliability tests')
backend.addRoots(project.id, [root])
backend.flushProjectsSync()
after(async () => { await fs.rm(sandbox, { recursive: true, force: true }) })

const session = (content) => ({
  version: 1, tabs: [{ id: 'tab', path: join(root, 'draft.md'), name: 'draft.md', language: 'markdown',
    cursor: { anchor: 1, head: 2 }, scrollTop: 34, scrollLeft: 0, mdView: 'split', svgPreview: false,
    draft: { content, savedContent: '', revision: null } }],
  activeTabId: 'tab', expanded: [root], selectedPath: join(root, 'draft.md'), sidebarWidth: 240
})

test('atomic failure preserves original bytes, permissions and removes temporary file', async () => {
  const file = join(root, 'atomic.txt')
  await fs.writeFile(file, 'original', { mode: 0o640 })
  await assert.rejects(backend.atomicWrite(file, 'lost', async () => { throw new Error('write vetoed') }), /write vetoed/)
  assert.equal(await fs.readFile(file, 'utf8'), 'original')
  assert.equal((await fs.stat(file)).mode & 0o777, 0o640)
  assert.equal((await fs.readdir(root)).filter((f) => f.endsWith('.tmp')).length, 0)
  await backend.atomicWrite(file, 'saved')
  assert.equal(await fs.readFile(file, 'utf8'), 'saved')
  assert.equal((await fs.stat(file)).mode & 0o777, 0o640)
})

test('save detects external edits, serializes competing saves, and requires revision', async () => {
  const file = join(root, 'race.txt')
  await fs.writeFile(file, 'base')
  const opened = await backend.openFile(file)
  assert.equal(opened.type, 'text')
  await fs.writeFile(file, 'external')
  assert.equal((await backend.writeTextFile(file, 'overwrite', { expectedRevision: opened.revision })).code, 'CONFLICT')
  assert.equal(await fs.readFile(file, 'utf8'), 'external')
  const current = await backend.openFile(file)
  const saves = await Promise.all(['first', 'second'].map((text) => backend.writeTextFile(file, text, { expectedRevision: current.revision })))
  assert.equal(saves.filter((result) => result.ok).length, 1)
  assert.equal(saves.filter((result) => result.code === 'CONFLICT').length, 1)
  // Filesystem authorization resolves asynchronously; either request may enter
  // the write queue first, but only the successful request may reach disk.
  assert.equal(await fs.readFile(file, 'utf8'), ['first', 'second'][saves.findIndex((result) => result.ok)])
  assert.equal((await backend.writeTextFile(file, 'blind')).code, 'EINVAL')
})

test('deleted files report missing and refuse stale save; explicit missing revision recreates', async () => {
  const file = join(root, 'deleted.txt')
  await fs.writeFile(file, 'base')
  const opened = await backend.openFile(file)
  await fs.unlink(file)
  assert.equal((await backend.openFile(file)).code, 'ENOENT')
  assert.equal((await backend.writeTextFile(file, 'stale', { expectedRevision: opened.revision })).code, 'CONFLICT')
  assert.equal((await backend.writeTextFile(file, 'recovered', { expectedRevision: null })).ok, true)
  assert.equal(await fs.readFile(file, 'utf8'), 'recovered')
})

test('Save As grants only selected file and rejects other open destination', async () => {
  const file = join(sandbox, 'outside.txt')
  assert.equal((await backend.writeTextFile(file, 'denied', { expectedRevision: null })).code, 'EACCES')
  backend.setSavePath(file)
  const saved = await backend.saveAs(join(root, 'source.txt'), 'saved outside')
  assert.equal(saved.ok, true)
  assert.equal((await backend.openFile(file)).content, 'saved outside')
  assert.deepEqual(JSON.parse(await fs.readFile(join(userData, 'file-grants.json'), 'utf8')), [await fs.realpath(file)])
  assert.equal(await backend.isPathAllowed(sandbox), false)
  assert.equal(await backend.isPathAllowed(join(sandbox, 'neighbor.txt')), false)
  assert.equal((await backend.saveAs(join(root, 'source.txt'), 'collision', [file])).code, 'ALREADY_OPEN')
  assert.equal(await fs.readFile(file, 'utf8'), 'saved outside')
})

test('session writes are durable, serialized, and recover last valid backup', async () => {
  const id = 'recovery-test'
  assert.equal(await backend.loadSession(id), null)
  assert.equal((await backend.saveSession(id, session('first'))).ok, true)
  assert.deepEqual(await backend.loadSession(id), session('first'))
  const results = await Promise.all(['second', 'third'].map((content) => backend.saveSession(id, session(content))))
  assert.equal(results.every((r) => r.ok), true)
  const file = join(userData, 'sessions', `${id}.json`)
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), session('third'))
  await fs.writeFile(file, '{corrupt')
  assert.deepEqual(await backend.loadSession(id), session('second'))
  assert.ok((await fs.readdir(join(userData, 'sessions'))).some((p) => p.startsWith(`${id}.json.corrupt-`)))
  await fs.writeFile(file, '{corrupt again')
  await fs.writeFile(`${file}.bak`, '{corrupt backup')
  await assert.rejects(backend.loadSession(id), /Cannot restore session/)
  assert.equal((await backend.saveSession(id, session('must not replace'))).ok, false)
  assert.equal(await fs.readFile(file, 'utf8'), '{corrupt again')
})

test('session validation rejects traversal and invalid drafts; remove does not resurrect backup', async () => {
  assert.equal((await backend.saveSession('../escape', session('bad'))).ok, false)
  const invalid = session('bad')
  invalid.tabs[0].draft.revision = 'invalid hash'
  assert.equal((await backend.saveSession('invalid', invalid)).ok, false)
  await backend.saveSession('remove-test', session('old'))
  await backend.saveSession('remove-test', session('new'))
  assert.equal((await backend.removeSession('remove-test')).ok, true)
  assert.equal(await backend.loadSession('remove-test'), null)
})


test('close and reload wait for matching one-shot renderer approval; quit remains cancellable', () => {
  const win = new EventEmitter()
  const webContents = new EventEmitter()
  const messages = []
  let reloads = 0
  webContents.send = (channel, payload) => messages.push({ channel, payload: { ...payload } })
  webContents.reload = () => { reloads++ }
  win.webContents = webContents
  win.isDestroyed = () => false
  backend.installLifecycleGuard(win)
  const closeEvent = { prevented: false, preventDefault() { this.prevented = true } }
  win.emit('close', closeEvent)
  assert.equal(closeEvent.prevented, true)
  assert.equal(messages[0].channel, 'evt:requestClose')
  assert.equal(messages[0].payload.reason, 'close')
  backend.respondClose(messages[0].payload.id, false)
  backend.requestClose('reload')
  const reloadRequest = messages.at(-1).payload
  backend.respondClose(reloadRequest.id + 1, true)
  assert.equal(reloads, 0)
  backend.respondClose(reloadRequest.id, true)
  backend.respondClose(reloadRequest.id, true)
  assert.equal(reloads, 1)
  backend.testApp.quit()
  assert.equal(backend.testApp.quitCalls, 0)
  assert.equal(messages.at(-1).payload.reason, 'quit')
  backend.respondClose(messages.at(-1).payload.id, false)
  assert.equal(backend.testApp.quitCalls, 0)
  backend.testApp.quit()
  backend.respondClose(messages.at(-1).payload.id, true)
  assert.equal(backend.testApp.quitCalls, 1)
})
