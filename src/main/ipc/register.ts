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
  writeTextFile
} from '../services/fs-service'
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
import { updateWindowState } from '../window-state'

type Handler<C extends IpcChannel> = (
  ...args: Parameters<IpcInvokeMap[C]>
) => ReturnType<IpcInvokeMap[C]> | Promise<ReturnType<IpcInvokeMap[C]>>

function handle<C extends IpcChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as Parameters<IpcInvokeMap[C]>)))
}

export function registerIpcHandlers(): void {
  handle('fs:readDir', (dirPath) => readDirSorted(dirPath))
  handle('fs:openFile', (filePath) => openFile(filePath))
  handle('fs:writeFile', (filePath, content) => writeTextFile(filePath, content))
  handle('fs:createFile', (dirPath, name) => createFile(dirPath, name))
  handle('fs:createDir', (dirPath, name) => createDir(dirPath, name))
  handle('fs:rename', (path, newName) => renamePath(path, newName))
  handle('fs:trash', (path) => trashPath(path))
  handle('fs:reveal', (path) => revealInFinder(path))

  handle('shell:openExternal', (url) => openExternalUrl(url))

  handle('search:run', (req) => runSearch(req))
  handle('search:files', (roots, query) => quickOpenSearch(roots, query))

  handle('watch:setRoots', (paths) => {
    const win = mainWindow()
    if (win) setWatchRoots(paths, win)
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
