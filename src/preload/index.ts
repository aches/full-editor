import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcInvokeMap } from '@shared/ipc'
import type { ExportFormat, ExportRequest, CloseRequest, FileWriteRequest, ProjectSession, FsChangedPayload, SearchRequest, ThemePref } from '@shared/types'

type Invoke = <C extends IpcChannel>(
  channel: C,
  ...args: Parameters<IpcInvokeMap[C]>
) => Promise<Awaited<ReturnType<IpcInvokeMap[C]>>>

const invoke: Invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string): (cb: (payload: T) => void) => () => void {
  return (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  export: {
    document: (request: ExportRequest) => invoke('export:document', request)
  },
  fs: {
    readDir: (dirPath: string) => invoke('fs:readDir', dirPath),
    openFile: (filePath: string) => invoke('fs:openFile', filePath),
    writeFile: (filePath: string, content: string, options: FileWriteRequest) => invoke('fs:writeFile', filePath, content, options),
    saveAs: (sourcePath: string, content: string, forbiddenPaths?: string[]) => invoke('fs:saveAs', sourcePath, content, forbiddenPaths),
    createFile: (dirPath: string, name: string) => invoke('fs:createFile', dirPath, name),
    createDir: (dirPath: string, name: string) => invoke('fs:createDir', dirPath, name),
    rename: (path: string, newName: string) => invoke('fs:rename', path, newName),
    trash: (path: string) => invoke('fs:trash', path),
    reveal: (path: string) => invoke('fs:reveal', path)
  },
  shell: {
    openExternal: (url: string) => invoke('shell:openExternal', url)
  },
  search: {
    run: (req: SearchRequest) => invoke('search:run', req),
    files: (roots: string[], query: string) => invoke('search:files', roots, query)
  },
  watch: {
    setRoots: (paths: string[]) => invoke('watch:setRoots', paths)
  },
  sessions: {
    load: (projectId: string) => invoke('sessions:load', projectId),
    save: (projectId: string, session: ProjectSession) => invoke('sessions:save', projectId, session),
    remove: (projectId: string) => invoke('sessions:remove', projectId)
  },
  dialog: {
    confirmUnsaved: (names: string[], action: string) => invoke('dialog:confirmUnsaved', names, action),
    pickDirectories: () => invoke('dialog:pickDirectories')
  },
  projects: {
    getAll: () => invoke('projects:getAll'),
    create: (name: string) => invoke('projects:create', name),
    rename: (id: string, name: string) => invoke('projects:rename', id, name),
    remove: (id: string) => invoke('projects:delete', id),
    setActive: (id: string | null) => invoke('projects:setActive', id),
    addRoots: (id: string, paths: string[]) => invoke('projects:addRoots', id, paths),
    removeRoot: (id: string, rootId: string) => invoke('projects:removeRoot', id, rootId)
  },
  app: {
    takePendingOpenFiles: () => invoke('app:takePendingOpenFiles')
  },
  window: {
    respondClose: (id: number, allow: boolean) => invoke('window:respondClose', id, allow),
    setOpacity: (value: number) => invoke('window:setOpacity', value),
    setAlwaysOnTop: (on: boolean) => invoke('window:setAlwaysOnTop', on),
    setMiniMode: (on: boolean) => invoke('window:setMiniMode', on),
    getState: () => invoke('window:getState'),
    setThemePref: (pref: ThemePref, palette: string) => invoke('window:setThemePref', pref, palette)
  },
  events: {
    onExportActiveTab: subscribe<ExportFormat>('evt:exportActiveTab'),
    onRequestClose: subscribe<CloseRequest>('evt:requestClose'),
    onSaveAllTabs: subscribe<void>('evt:saveAllTabs'),
    onSaveAsActiveTab: subscribe<void>('evt:saveAsActiveTab'),
    onSystemThemeChanged: subscribe<boolean>('evt:systemThemeChanged'),
    onMiniModeChanged: subscribe<boolean>('evt:miniModeChanged'),
    onSaveActiveTab: subscribe<void>('evt:saveActiveTab'),
    onCloseActiveTab: subscribe<void>('evt:closeActiveTab'),
    onFsChanged: subscribe<FsChangedPayload>('evt:fsChanged'),
    onOpenSearch: subscribe<void>('evt:openSearch'),
    onOpenQuickOpen: subscribe<void>('evt:openQuickOpen'),
    onOpenExternalFile: subscribe<string>('evt:openExternalFile')
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
