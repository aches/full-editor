import { dialog, ipcMain } from 'electron'
import type { IpcChannel, IpcInvokeMap } from '@shared/ipc'
import {
  createDir,
  createFile,
  openExternalUrl,
  openFile,
  readDirSorted,
  renamePath,
  revealInFinder,
  trashPath,
  writeTextFile,
  saveAs
} from '../services/fs-service'
import { exportDocument } from '../services/export-service'
import { runSearch } from '../services/search'
import { quickOpenSearch } from '../services/file-index'
import { setWatchRoots } from '../services/watcher'
import {
  addRoots,
  createProject,
  deleteProject,
  removeRoot,
  renameProject,
  setActiveProject,
  snapshot
} from '../services/project-store'
import { mainWindow, setAlwaysOnTop, setMiniMode, setOpacity, stateSnapshot } from '../window'
import { loadSession, saveSession, removeSession } from '../services/session-store'
import { respondClose } from '../lifecycle'
import { takePendingOpenFiles } from '../services/open-files'
import { isPathAllowed } from '../services/fs-service'
import { updateWindowState } from '../window-state'

type Handler<C extends IpcChannel> = (
  ...args: Parameters<IpcInvokeMap[C]>
) => ReturnType<IpcInvokeMap[C]> | Promise<ReturnType<IpcInvokeMap[C]>>

function handle<C extends IpcChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as Parameters<IpcInvokeMap[C]>)))
}

export function registerIpcHandlers(): void {
  ipcMain.handle('export:document', (event, request) => {
    const win = mainWindow()
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
      return { ok: false, code: 'EACCES', message: 'Export is available only from the editor window.' }
    }
    return exportDocument(request)
  })
  handle('fs:readDir', (dirPath) => readDirSorted(dirPath))
  handle('fs:openFile', (filePath) => openFile(filePath))
  handle('fs:writeFile', (filePath, content, options) => writeTextFile(filePath, content, options))
  handle('fs:saveAs', (path, content, forbiddenPaths) => saveAs(path, content, forbiddenPaths))
  handle('fs:createFile', (dirPath, name) => createFile(dirPath, name))
  handle('fs:createDir', (dirPath, name) => createDir(dirPath, name))
  handle('fs:rename', (path, newName) => renamePath(path, newName))
  handle('fs:trash', (path) => trashPath(path))
  handle('fs:reveal', (path) => revealInFinder(path))

  handle('shell:openExternal', (url) => openExternalUrl(url))

  handle('search:run', (req) => runSearch(req))
  handle('search:files', (roots, query) => quickOpenSearch(roots, query))

  handle('watch:setRoots', async (paths) => {
    const allowed = await Promise.all(paths.map(async (path) => await isPathAllowed(path) ? path : null))
    const win = mainWindow()
    if (win) setWatchRoots(allowed.filter((path): path is string => path !== null), win)
  })

  handle('sessions:load', (id) => loadSession(id))
  handle('sessions:save', (id, session) => saveSession(id, session))
  handle('sessions:remove', (id) => removeSession(id))
  handle('app:takePendingOpenFiles', () => takePendingOpenFiles())
  handle('window:respondClose', (id, allow) => respondClose(id, allow))
  handle('dialog:confirmUnsaved', async (names, action) => {
    const win = mainWindow()
    if (!win) return 'cancel'
    const result = await dialog.showMessageBox(win, {
      type: 'warning', title: 'Unsaved changes',
      message: `Save changes before ${action}?`,
      detail: names.slice(0, 20).join('\n') + (names.length > 20 ? `\n…and ${names.length - 20} more` : ''),
      buttons: ['Save All', 'Discard', 'Cancel'], defaultId: 0, cancelId: 2, noLink: true
    })
    return result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel'
  })

  handle('dialog:pickDirectories', async () => {
    const win = mainWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'multiSelections', 'createDirectory'],
      buttonLabel: 'Add to Project'
    })
    return result.canceled ? [] : result.filePaths
  })

  handle('projects:getAll', () => snapshot())
  handle('projects:create', (name) => createProject(name))
  handle('projects:rename', (id, name) => renameProject(id, name))
  handle('projects:delete', (id) => deleteProject(id))
  handle('projects:setActive', (id) => setActiveProject(id))
  handle('projects:addRoots', (id, paths) => addRoots(id, paths))
  handle('projects:removeRoot', (id, rootId) => removeRoot(id, rootId))

  handle('window:setOpacity', (value) => setOpacity(value))
  handle('window:setAlwaysOnTop', (on) => setAlwaysOnTop(on))
  handle('window:setMiniMode', (on) => setMiniMode(on))
  handle('window:getState', () => stateSnapshot())
  handle('window:setThemePref', (pref, palette) => {
    updateWindowState((s) => {
      s.themePref = pref
      s.palette = palette
    })
  })
}
