import type {
  CloseRequest,
  ExportFormat,
  ExportRequest,
  ExportResult,
  FileWriteRequest,
  FileWriteResult,
  ProjectSession,
  CreateResult,
  DirEntry,
  FileOpenResult,
  FsChangedPayload,
  MiniModeResult,
  Project,
  ProjectStoreSnapshot,
  QuickOpenResponse,
  RenameResult,
  SearchRequest,
  SearchResponse,
  ThemePref,
  WindowStateSnapshot,
  WriteResult
} from './types'

/**
 * Single source of truth for the IPC surface. Main handlers and the preload
 * bridge are both typed against this map, so a signature change breaks the
 * build on every side that needs updating.
 */
export interface IpcInvokeMap {
  'export:document': (request: ExportRequest) => ExportResult
  'fs:readDir': (dirPath: string) => DirEntry[]
  'fs:openFile': (filePath: string) => FileOpenResult
  'fs:writeFile': (filePath: string, content: string, options: FileWriteRequest) => FileWriteResult
  'fs:saveAs': (sourcePath: string, content: string, forbiddenPaths?: string[]) => FileWriteResult
  'fs:createFile': (dirPath: string, name: string) => CreateResult
  'fs:createDir': (dirPath: string, name: string) => CreateResult
  'fs:rename': (path: string, newName: string) => RenameResult
  'fs:trash': (path: string) => WriteResult
  'fs:reveal': (path: string) => void

  'shell:openExternal': (url: string) => void

  'search:run': (req: SearchRequest) => SearchResponse
  'search:files': (roots: string[], query: string) => QuickOpenResponse

  'watch:setRoots': (paths: string[]) => void

  'dialog:confirmUnsaved': (names: string[], action: string) => 'save' | 'discard' | 'cancel'

  'sessions:load': (projectId: string) => ProjectSession | null
  'sessions:save': (projectId: string, session: ProjectSession) => WriteResult
  'sessions:remove': (projectId: string) => WriteResult

  'dialog:pickDirectories': () => string[]

  'projects:getAll': () => ProjectStoreSnapshot
  'projects:create': (name: string) => Project
  'projects:rename': (id: string, name: string) => Project
  'projects:delete': (id: string) => ProjectStoreSnapshot
  'projects:setActive': (id: string | null) => void
  'projects:addRoots': (id: string, paths: string[]) => Project
  'projects:removeRoot': (id: string, rootId: string) => Project

  'app:takePendingOpenFiles': () => string[]

  'window:respondClose': (id: number, allow: boolean) => boolean
  'window:setOpacity': (value: number) => number
  'window:setAlwaysOnTop': (on: boolean) => boolean
  'window:setMiniMode': (on: boolean) => MiniModeResult
  'window:getState': () => WindowStateSnapshot
  'window:setThemePref': (pref: ThemePref, palette: string) => void
}

export type IpcChannel = keyof IpcInvokeMap

/** Main → renderer push events. */
export interface IpcEventMap {
  'evt:exportActiveTab': (format: ExportFormat) => void
  'evt:systemThemeChanged': (dark: boolean) => void
  'evt:miniModeChanged': (on: boolean) => void
  'evt:requestClose': (request: CloseRequest) => void
  'evt:saveAllTabs': () => void
  'evt:saveAsActiveTab': () => void
  'evt:saveActiveTab': () => void
  'evt:closeActiveTab': () => void
  'evt:fsChanged': (payload: FsChangedPayload) => void
  'evt:openSearch': () => void
  'evt:openQuickOpen': () => void
  'evt:openExternalFile': (path: string) => void
}

export type IpcEventChannel = keyof IpcEventMap
