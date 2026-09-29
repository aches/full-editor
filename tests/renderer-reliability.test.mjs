import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Run with: node --test tests/renderer-reliability.test.mjs
// Bundle the real store and CodeMirror state so tests need neither Electron nor a DOM.
const require = createRequire(import.meta.url)
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('electron-vite')] }))
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'full-editor-renderer-tests-'))
const bundle = join(temporary, 'store.cjs')
await build({
  absWorkingDir: root,
  stdin: {
    contents: `export { useStore } from './src/renderer/src/stores/index';
      export * from './src/renderer/src/editor/doc-registry';
      export { undo } from '@codemirror/commands';`,
    resolveDir: root,
    loader: 'ts'
  },
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  tsconfig: join(root, 'tsconfig.web.json'),
  logLevel: 'silent',
  plugins: [{
    name: 'toast-only',
    setup(build) {
      build.onResolve({ filter: /^@heroui\/react$/ }, () => ({ path: 'toast', namespace: 'test' }))
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const toast = () => {};' }))
    }
  }]
})
after(() => rm(temporary, { recursive: true, force: true }))

const revision = (content) => createHash('sha256').update(content).digest('hex')

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function harness(t) {
  const files = new Map([['/notes/a.txt', 'saved version']])
  const sessions = new Map()
  const calls = { opens: [], writes: [], confirms: [], creates: [], deletes: [], switches: [], sessions: [], close: [] }
  const projects = [
    { id: 'p1', name: 'Notes', roots: [{ id: 'r1', path: '/notes' }], createdAt: 1, updatedAt: 1 },
    { id: 'p2', name: 'Other', roots: [], createdAt: 1, updatedAt: 1 }
  ]
  const controls = { decision: 'cancel', saveFailure: null, sessionFailure: null, openGate: null, writeGate: null }
  const api = {
    fs: {
      async openFile(path) {
        calls.opens.push(path)
        if (controls.openGate) await controls.openGate.promise
        const content = files.get(path)
        return content === undefined
          ? { type: 'error', code: 'ENOENT', message: 'File does not exist.' }
          : { type: 'text', content, size: Buffer.byteLength(content), readOnly: false, revision: revision(content) }
      },
      async writeFile(path, content, options) {
        calls.writes.push({ path, content, options })
        if (controls.writeGate) await controls.writeGate.promise
        if (controls.saveFailure) return controls.saveFailure
        const before = files.get(path)
        const actualRevision = before === undefined ? null : revision(before)
        if (!options || options.expectedRevision !== actualRevision) {
          return { ok: false, code: 'CONFLICT', message: 'File changed on disk.' }
        }
        files.set(path, content)
        return { ok: true, path, revision: revision(content) }
      },
      async saveAs() { return { ok: false, code: 'CANCELLED', message: 'Cancelled' } },
      async readDir() { return [] }
    },
    dialog: {
      async confirmUnsaved(names, action) {
        calls.confirms.push({ names, action })
        return controls.decision
      }
    },
    sessions: {
      async load(id) { return sessions.get(id) ?? null },
      async save(id, session) {
        calls.sessions.push({ id, session: structuredClone(session) })
        if (controls.sessionFailure) return controls.sessionFailure
        sessions.set(id, structuredClone(session))
        return { ok: true }
      },
      async remove(id) { sessions.delete(id); return { ok: true } }
    },
    projects: {
      async getAll() { return { projects, activeProjectId: 'p1' } },
      async create(name) {
        calls.creates.push(name)
        const project = { id: 'p3', name, roots: [], createdAt: 1, updatedAt: 1 }
        projects.push(project)
        return project
      },
      async remove(id) {
        calls.deletes.push(id)
        return { projects: projects.filter((project) => project.id !== id), activeProjectId: 'p2' }
      },
      async setActive(id) { calls.switches.push(id) }
    },
    watch: { async setRoots() {} },
    window: { async respondClose(id, allow) { calls.close.push({ id, allow }) } }
  }
  globalThis.window = { api }
  delete require.cache[require.resolve(bundle)]
  const renderer = require(bundle)
  const store = renderer.useStore
  store.setState({ projects, activeProjectId: 'p1', sessionReady: true })
  t.after(async () => {
    controls.openGate?.resolve()
    controls.writeGate?.resolve()
    // Flush each module's debounce before swapping the global IPC mock for the next test.
    if (store.getState().flushSession) await store.getState().flushSession()
    for (const tab of store.getState().tabs) renderer.dropDoc(tab.id)
  })
  return { ...renderer, store, api, controls, calls, files, sessions }
}

async function openAndEdit(h, content = 'unsaved work') {
  await h.store.getState().openFile('/notes/a.txt', 'a.txt')
  const id = h.store.getState().activeTabId
  edit(h, id, content)
  return id
}

function edit(h, id, content) {
  const entry = h.getDoc(id)
  h.putState(id, entry.state.update({ changes: { from: 0, to: entry.state.doc.length, insert: content } }).state)
  h.store.getState().markDirty(id, h.isDirtyNow(id))
  h.notifyDocChanged(id)
}

for (const action of ['create', 'delete', 'switch']) {
  test(`cancel ${action} project preserves the open draft and performs no project mutation`, async (t) => {
    const h = harness(t)
    const id = await openAndEdit(h)
    if (action === 'create') await h.store.getState().createProject('New')
    else if (action === 'delete') await h.store.getState().deleteProject('p1')
    else await h.store.getState().switchProject('p2')
    assert.equal(h.calls.confirms.length, 1)
    assert.equal(h.store.getState().activeProjectId, 'p1')
    assert.equal(h.store.getState().activeTabId, id)
    assert.equal(h.currentDoc(id), 'unsaved work')
    assert.equal(h.store.getState().tabs[0].dirty, true)
    assert.deepEqual(h.calls.creates, [])
    assert.deepEqual(h.calls.deletes, [])
    assert.deepEqual(h.calls.switches, [])
  })
}

test('failed save keeps a dirty tab open when Save and Close is requested', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.controls.saveFailure = { ok: false, code: 'EACCES', message: 'Permission denied' }
  h.controls.decision = 'save'
  await h.store.getState().closeTab(id)
  assert.equal(h.store.getState().tabs.length, 1)
  assert.equal(h.store.getState().tabs[0].dirty, true)
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.files.get('/notes/a.txt'), 'saved version')
})

test('edits made while a save is in flight remain dirty and cannot be closed as saved', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h, 'first edit')
  h.controls.writeGate = deferred()
  h.controls.decision = 'save'
  const saving = h.store.getState().closeTab(id)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.calls.writes.length, 1)
  edit(h, id, 'newer edit made during save')
  h.controls.writeGate.resolve()
  await saving
  assert.equal(h.files.get('/notes/a.txt'), 'first edit')
  assert.equal(h.currentDoc(id), 'newer edit made during save')
  assert.equal(h.store.getState().tabs.length, 1)
  assert.equal(h.store.getState().tabs[0].dirty, true)
})

test('concurrent opens of the same file create exactly one tab and document', async (t) => {
  const h = harness(t)
  h.controls.openGate = deferred()
  const first = h.store.getState().openFile('/notes/a.txt', 'a.txt')
  const second = h.store.getState().openFile('/notes/a.txt', 'a.txt')
  h.controls.openGate.resolve()
  await Promise.all([first, second])
  assert.equal(h.store.getState().tabs.length, 1)
  assert.equal(h.currentDoc(h.store.getState().activeTabId), 'saved version')
})

test('external modification prevents a normal save from silently overwriting disk', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.files.set('/notes/a.txt', 'external changes')
  const saved = await h.store.getState().saveTab(id)
  assert.equal(saved, false)
  assert.equal(h.files.get('/notes/a.txt'), 'external changes')
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.store.getState().tabs[0].conflict.type, 'changed')
  assert.equal(h.store.getState().tabs[0].dirty, true)
})

test('overwrite approval applies only to the reviewed disk revision', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.files.set('/notes/a.txt', 'first external change')
  await h.store.getState().inspectDiskConflict(id)
  assert.equal(h.store.getState().tabs[0].conflict.diskContent, 'first external change')
  h.files.set('/notes/a.txt', 'second external change after review')
  assert.equal(await h.store.getState().resolveDiskConflict(id, 'overwrite'), false)
  assert.equal(h.files.get('/notes/a.txt'), 'second external change after review')
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.store.getState().tabs[0].conflict.diskContent, 'second external change after review')
})

test('watcher conflict detection preserves dirty edits instead of reloading them', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.files.set('/notes/a.txt', 'external watcher change')
  await h.store.getState().reloadCleanTabFromDisk('/notes/a.txt')
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.store.getState().tabs[0].dirty, true)
  assert.equal(h.store.getState().tabs[0].conflict.type, 'changed')
})

test('undo to the saved baseline clears dirty state using actual CodeMirror history', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  assert.equal(h.isDirtyNow(id), true)
  assert.equal(h.undo({
    state: h.getDoc(id).state,
    dispatch(transaction) { h.putState(id, transaction.state) }
  }), true)
  h.store.getState().markDirty(id, h.isDirtyNow(id))
  assert.equal(h.currentDoc(id), 'saved version')
  assert.equal(h.store.getState().tabs[0].dirty, false)
})

test('startup restores an unsaved draft even when its original file has disappeared', async (t) => {
  const h = harness(t)
  h.store.setState({ sessionReady: false })
  h.files.delete('/notes/a.txt')
  h.sessions.set('p1', {
    version: 1,
    tabs: [{
      id: 'recovered-tab', path: '/notes/a.txt', name: 'a.txt', language: 'plain',
      cursor: { anchor: 4, head: 9 }, scrollTop: 72, scrollLeft: 3,
      mdView: 'edit', svgPreview: false,
      draft: { content: 'precious unsaved draft', savedContent: 'saved version', revision: revision('saved version') }
    }],
    activeTabId: 'recovered-tab', expanded: ['/notes'], selectedPath: '/notes/a.txt', sidebarWidth: 300
  })
  await h.store.getState().loadProjects()
  const tab = h.store.getState().activeTab()
  assert.ok(tab, 'the missing file must still have an editor tab for its recovered draft')
  assert.equal(tab.viewer, 'editor')
  assert.equal(tab.readOnly, false)
  assert.equal(tab.dirty, true)
  assert.equal(tab.recovered, true)
  assert.equal(tab.conflict.type, 'missing')
  assert.equal(h.currentDoc(tab.id), 'precious unsaved draft')
  assert.equal(h.getDoc(tab.id).state.selection.main.anchor, 4)
  assert.equal(h.getDoc(tab.id).state.selection.main.head, 9)
  assert.equal(h.getDoc(tab.id).scrollTop, 72)
  assert.equal(h.store.getState().expanded['/notes'], true)
  assert.equal(h.store.getState().sidebarWidth, 300)
  assert.equal(h.calls.writes.length, 0, 'recovery must not write the draft over a disk file')
})

test('a session flush failure prevents project switch even after choosing Discard', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.controls.decision = 'discard'
  h.controls.sessionFailure = { ok: false, code: 'ENOSPC', message: 'No space left for session backup' }
  await h.store.getState().switchProject('p2')
  assert.equal(h.calls.confirms.length, 1)
  assert.equal(h.calls.switches.length, 0)
  assert.equal(h.store.getState().activeProjectId, 'p1')
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.store.getState().tabs[0].dirty, true)
})

test('a session flush failure prevents closing a clean tab', async (t) => {
  const h = harness(t)
  await h.store.getState().openFile('/notes/a.txt', 'a.txt')
  const id = h.store.getState().activeTabId
  h.controls.sessionFailure = { ok: false, code: 'ENOSPC', message: 'No space left for session backup' }
  await h.store.getState().closeTab(id)
  assert.equal(h.store.getState().tabs.length, 1)
  assert.equal(h.currentDoc(id), 'saved version')
})

test('deleting an inactive project preserves the current unsaved editor', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.api.projects.remove = async (deletedId) => {
    h.calls.deletes.push(deletedId)
    return { projects: h.store.getState().projects.filter((p) => p.id !== deletedId), activeProjectId: 'p1' }
  }
  await h.store.getState().deleteProject('p2')
  assert.equal(h.calls.confirms.length, 0)
  assert.equal(h.store.getState().activeProjectId, 'p1')
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.store.getState().tabs[0].dirty, true)
  assert.equal(h.sessions.get('p1').tabs[0].draft.content, 'unsaved work')
})

test('save and switch persists the outgoing workspace and restores it on return', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.controls.decision = 'save'
  h.store.setState({ expanded: { '/notes': true, '/notes/nested': true }, sidebarWidth: 310 })
  await h.store.getState().switchProject('p2')
  assert.equal(h.files.get('/notes/a.txt'), 'unsaved work')
  assert.equal(h.store.getState().tabs.length, 0)
  assert.equal(h.sessions.get('p1').tabs[0].draft, undefined)
  await h.store.getState().switchProject('p1')
  assert.equal(h.store.getState().activeTabId, id)
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.store.getState().tabs[0].dirty, false)
  assert.equal(h.store.getState().sidebarWidth, 310)
  assert.ok(h.store.getState().childrenByDir['/notes/nested'])
})

test('discard then switch does not resurrect the discarded draft', async (t) => {
  const h = harness(t)
  await openAndEdit(h)
  await h.store.getState().flushSession()
  h.controls.decision = 'discard'
  await h.store.getState().switchProject('p2')
  assert.equal(h.sessions.get('p1').tabs[0].draft, undefined)
  await h.store.getState().switchProject('p1')
  assert.equal(h.currentDoc(h.store.getState().activeTabId), 'saved version')
  assert.equal(h.store.getState().tabs[0].dirty, false)
})

test('a conflict discovered while Save All guards a project switch cancels the switch', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.controls.decision = 'save'
  h.files.set('/notes/a.txt', 'changed externally before the watcher')
  await h.store.getState().switchProject('p2')
  assert.equal(h.store.getState().activeProjectId, 'p1')
  assert.equal(h.store.getState().conflictTabId, id)
  assert.equal(h.store.getState().tabs[0].conflict.type, 'changed')
  assert.equal(h.currentDoc(id), 'unsaved work')
  assert.equal(h.calls.switches.length, 0)
})

test('multiple save requests serialize and save the most recent edit', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h, 'first')
  h.controls.writeGate = deferred()
  const first = h.store.getState().saveTab(id)
  edit(h, id, 'latest')
  const second = h.store.getState().saveTab(id)
  const third = h.store.getState().saveTab(id)
  h.controls.writeGate.resolve()
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true])
  assert.equal(h.files.get('/notes/a.txt'), 'latest')
  assert.equal(h.store.getState().tabs[0].dirty, false)
  assert.equal(h.calls.writes.length, 2)
})

test('recreate requires a still-missing file and preserves the draft on a new conflict', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  h.files.delete('/notes/a.txt')
  await h.store.getState().inspectDiskConflict(id)
  assert.equal(h.store.getState().tabs[0].conflict.type, 'missing')
  h.files.set('/notes/a.txt', 'someone recreated it first')
  assert.equal(await h.store.getState().resolveDiskConflict(id, 'overwrite'), false)
  assert.equal(h.files.get('/notes/a.txt'), 'someone recreated it first')
  assert.equal(h.currentDoc(id), 'unsaved work')
})

test('unmodified CRLF documents are not treated as unsaved changes', async (t) => {
  const h = harness(t)
  h.files.set('/notes/a.txt', 'first\r\nsecond\r\n')
  await h.store.getState().openFile('/notes/a.txt', 'a.txt')
  const id = h.store.getState().activeTabId
  assert.equal(h.isDirtyNow(id), false)
  await h.store.getState().closeTab(id)
  assert.equal(h.calls.confirms.length, 0)
  assert.equal(h.calls.writes.length, 0)
  assert.equal(h.files.get('/notes/a.txt'), 'first\r\nsecond\r\n')
})

test('a save completed before a crash is not restored as a dirty draft', async (t) => {
  const h = harness(t)
  const id = await openAndEdit(h)
  await h.store.getState().flushSession()
  const snapshot = h.sessions.get('p1')
  h.files.set('/notes/a.txt', 'unsaved work')
  await h.store.getState().restoreSession(snapshot)
  assert.equal(h.store.getState().activeTabId, id)
  assert.equal(h.store.getState().tabs[0].dirty, false)
  assert.equal(h.store.getState().tabs[0].recovered, false)
  assert.equal(h.store.getState().tabs[0].revision, revision('unsaved work'))
})
