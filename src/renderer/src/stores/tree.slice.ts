import type { StateCreator } from 'zustand'
import { toast } from '@heroui/react'
import type { DirEntry, FsChangedPayload } from '@shared/types'
import { dirname } from '@/lib/paths'
import type { AppStore } from './index'

export interface FsModalState {
  mode: 'new-file' | 'new-dir' | 'rename'
  /** new-file/new-dir: the parent dir. rename: the entry itself. */
  targetPath: string
  initialName: string
}

export interface ConfirmTrashState {
  path: string
  name: string
  isDir: boolean
}

export interface TreeSlice {
  expanded: Record<string, true>
  childrenByDir: Record<string, DirEntry[]>
  loadingDirs: Record<string, true>
  errorByDir: Record<string, string>
  selectedPath: string | null
  fsModal: FsModalState | null
  confirmTrash: ConfirmTrashState | null

  toggleDir: (path: string) => void
  loadDir: (path: string) => Promise<void>
  refreshTree: () => Promise<void>
  resetTree: () => void
  pruneTreeForRemovedRoot: () => void
  setSelectedPath: (path: string | null) => void
  setFsModal: (modal: FsModalState | null) => void
  setConfirmTrash: (confirm: ConfirmTrashState | null) => void
  submitFsModal: (name: string) => Promise<void>
  trashConfirmed: () => Promise<void>
  revealEntry: (path: string) => void
  applyFsChanges: (payload: FsChangedPayload) => void
}

export const createTreeSlice: StateCreator<AppStore, [], [], TreeSlice> = (set, get) => ({
  expanded: {},
  childrenByDir: {},
  loadingDirs: {},
  errorByDir: {},
  selectedPath: null,
  fsModal: null,
  confirmTrash: null,

  toggleDir: (path) => {
    const { expanded } = get()
    if (expanded[path]) {
      const next = { ...expanded }
      delete next[path]
      set({ expanded: next })
      return
    }
    set({ expanded: { ...expanded, [path]: true } })
    if (!get().childrenByDir[path]) void get().loadDir(path)
  },

  loadDir: async (path) => {
    set((s) => {
      const errorByDir = { ...s.errorByDir }
      delete errorByDir[path]
      return { loadingDirs: { ...s.loadingDirs, [path]: true }, errorByDir }
    })
    try {
      const entries = await window.api.fs.readDir(path)
      set((s) => {
        const loadingDirs = { ...s.loadingDirs }
        delete loadingDirs[path]
        return { childrenByDir: { ...s.childrenByDir, [path]: entries }, loadingDirs }
      })
    } catch (err) {
      set((s) => {
        const loadingDirs = { ...s.loadingDirs }
        delete loadingDirs[path]
        return {
          loadingDirs,
          errorByDir: { ...s.errorByDir, [path]: err instanceof Error ? err.message : String(err) }
        }
      })
    }
  },

  refreshTree: async () => {
    const active = get().activeProject()
    if (!active) return
    const targets = new Set<string>()
    for (const root of active.roots) {
      if (get().expanded[root.path]) targets.add(root.path)
    }
    for (const dir of Object.keys(get().expanded)) {
      if (get().childrenByDir[dir] || get().errorByDir[dir]) targets.add(dir)
    }
    await Promise.all([...targets].map((dir) => get().loadDir(dir)))
  },

  resetTree: () =>
    set({ expanded: {}, childrenByDir: {}, loadingDirs: {}, errorByDir: {}, selectedPath: null }),

  /** Drop cached subtrees whose root no longer belongs to the active project. */
  pruneTreeForRemovedRoot: () => {
    const active = get().activeProject()
    const rootPaths = active?.roots.map((r) => r.path) ?? []
    const within = (p: string): boolean => rootPaths.some((r) => p === r || p.startsWith(r + '/'))
    set((s) => {
      const filterMap = <T>(obj: Record<string, T>): Record<string, T> =>
        Object.fromEntries(Object.entries(obj).filter(([k]) => within(k))) as Record<string, T>
      return {
        expanded: filterMap(s.expanded),
        childrenByDir: filterMap(s.childrenByDir),
        loadingDirs: filterMap(s.loadingDirs),
        errorByDir: filterMap(s.errorByDir)
      }
    })
  },

  setSelectedPath: (path) => set({ selectedPath: path }),
  setFsModal: (modal) => set({ fsModal: modal }),
  setConfirmTrash: (confirm) => set({ confirmTrash: confirm }),

  submitFsModal: async (name) => {
    const modal = get().fsModal
    if (!modal) return
    set({ fsModal: null })
    if (modal.mode === 'new-file' || modal.mode === 'new-dir') {
      const res =
        modal.mode === 'new-file'
          ? await window.api.fs.createFile(modal.targetPath, name)
          : await window.api.fs.createDir(modal.targetPath, name)
      if (!res.ok) {
        toast(modal.mode === 'new-file' ? 'Could not create file' : 'Could not create folder', {
          description: res.message,
          variant: 'danger'
        })
        return
      }
      // Make sure the parent is visible and fresh, then open new files.
      set((s) => ({ expanded: { ...s.expanded, [modal.targetPath]: true } }))
      await get().loadDir(modal.targetPath)
      if (modal.mode === 'new-file') {
        await get().openFile(res.path, name)
        get().setSelectedPath(res.path)
      }
    } else {
      const oldPath = modal.targetPath
      const res = await window.api.fs.rename(oldPath, name)
      if (!res.ok) {
        toast('Rename failed', { description: res.message, variant: 'danger' })
        return
      }
      const wasDir = !!get().childrenByDir[oldPath] || !!get().expanded[oldPath]
      get().updatePathsAfterRename(oldPath, res.newPath, wasDir)
      if (get().selectedPath === oldPath) get().setSelectedPath(res.newPath)
      await get().loadDir(dirname(oldPath))
    }
  },

  trashConfirmed: async () => {
    const confirm = get().confirmTrash
    if (!confirm) return
    set({ confirmTrash: null })
    const res = await window.api.fs.trash(confirm.path)
    if (!res.ok) {
      toast('Delete failed', { description: res.message, variant: 'danger' })
      return
    }
    get().closeCleanTabsUnder(confirm.path)
    if (get().selectedPath === confirm.path) get().setSelectedPath(null)
    await get().loadDir(dirname(confirm.path))
  },

  revealEntry: (path) => {
    void window.api.fs.reveal(path)
  },

  /** Watcher batch: refresh any cached dir that changed, resync open tabs. */
  applyFsChanges: (payload) => {
    const { childrenByDir, errorByDir } = get()
    for (const dir of payload.dirs) {
      if (childrenByDir[dir] || errorByDir[dir]) void get().loadDir(dir)
    }
    for (const file of payload.files) {
      void get().reloadCleanTabFromDisk(file)
    }
  }
})
