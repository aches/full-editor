export interface ProjectRoot {
  id: string
  /** Absolute directory path on disk. */
  path: string
}

export interface Project {
  id: string
  name: string
  roots: ProjectRoot[]
  createdAt: number
  updatedAt: number
}

export interface ProjectStoreSnapshot {
  projects: Project[]
  activeProjectId: string | null
}

export interface DirEntry {
  name: string
  /** Absolute path. */
  path: string
  kind: 'dir' | 'file' | 'symlink-dir' | 'symlink-file'
  /** Byte size; 0 for directories. */
  size: number
}

export type FileOpenResult =
  | { type: 'text'; content: string; size: number; readOnly: boolean }
  | { type: 'image'; url: string; size: number }
  | { type: 'binary'; size: number }
  | { type: 'too-large'; size: number; limit: number }
  | { type: 'error'; code: 'ENOENT' | 'EACCES' | 'UNKNOWN'; message: string }

export type WriteResult = { ok: true } | { ok: false; code: string; message: string }

export type CreateResult = { ok: true; path: string } | { ok: false; code: string; message: string }

export type RenameResult = { ok: true; newPath: string } | { ok: false; code: string; message: string }

export interface SearchRequest {
  roots: string[]
  query: string
  caseSensitive: boolean
  regex: boolean
}

export interface SearchMatch {
  line: number
  column: number
  preview: string
}

export interface SearchFileResult {
  path: string
  name: string
  matches: SearchMatch[]
}

export interface SearchResponse {
  files: SearchFileResult[]
  totalMatches: number
  truncated: boolean
  scannedFiles: number
  tookMs: number
  error?: string
}

export interface QuickOpenEntry {
  path: string
  name: string
  /** Display path: "<root basename>/relative/dir". */
  dir: string
}

export interface QuickOpenResponse {
  entries: QuickOpenEntry[]
  indexSize: number
  truncated: boolean
}

export interface FsChangedPayload {
  /** Parent directories that had entries added/removed/renamed. */
  dirs: string[]
  /** Individual files that changed content or vanished. */
  files: string[]
}

export type ThemePref = 'light' | 'dark' | 'system'

export interface WindowStateSnapshot {
  opacity: number
  pinned: boolean
  miniMode: boolean
  themePref: ThemePref
  /** Color palette id, or 'auto' for the mode's default palette. */
  palette: string
  systemDark: boolean
}

export interface MiniModeResult {
  miniMode: boolean
}

/** Text files above the soft limit open read-only; above the hard limit they don't open at all. */
export const TEXT_SOFT_LIMIT = 1.5 * 1024 * 1024
export const TEXT_HARD_LIMIT = 5 * 1024 * 1024

export const MIN_OPACITY = 0.3
