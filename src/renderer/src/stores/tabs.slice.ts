import type { StateCreator } from 'zustand'
import { toast } from '@heroui/react'
import { languageFor } from '@shared/file-kinds'
import {
  currentDoc,
  dropDoc,
  isDirtyNow,
  markSaved,
  replaceDocContent,
  seedDoc
} from '@/editor/doc-registry'
import { basename } from '@/lib/paths'
import type { AppStore } from './index'
import type { TabMeta } from './app-types'

export interface PendingGoto {
  path: string
  line: number
  column: number
}

export interface TabsSlice {
  tabs: TabMeta[]
  activeTabId: string | null
  pendingCloseTabId: string | null
  pendingGoto: PendingGoto | null

  activeTab: () => TabMeta | undefined
  openFile: (path: string, name: string) => Promise<void>
  openFileAtLocation: (path: string, line: number, column: number) => Promise<void>
  activateTab: (id: string) => void
  closeTab: (id: string) => void
  forceCloseTab: (id: string) => void
  closeAllTabs: () => void
  markDirty: (id: string, dirty: boolean) => void
  saveTab: (id: string) => Promise<boolean>
  saveActive: () => Promise<void>
  saveAndCloseTab: (id: string) => Promise<void>
  setPendingClose: (id: string | null) => void
  setPendingGoto: (goto: PendingGoto | null) => void
  updatePathsAfterRename: (oldPath: string, newPath: string, wasDir: boolean) => void
  closeCleanTabsUnder: (path: string) => void
  reloadCleanTabFromDisk: (path: string) => Promise<void>
}

export const createTabsSlice: StateCreator<AppStore, [], [], TabsSlice> = (set, get) => ({
  tabs: [],
  activeTabId: null,
  pendingCloseTabId: null,
  pendingGoto: null,

  activeTab: () => {
    const { tabs, activeTabId } = get()
    return tabs.find((t) => t.id === activeTabId)
  },

  openFile: async (path, name) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const res = await window.api.fs.openFile(path)
    const id = crypto.randomUUID()
    let tab: TabMeta
    switch (res.type) {
      case 'text': {
        const language = languageFor(name)
        seedDoc(id, res.content, language, res.readOnly)
        tab = {
          id,
          path,
          name,
          viewer: 'editor',
          language,
          readOnly: res.readOnly,
          dirty: false,
          size: res.size
        }
        break
      }
      case 'image':
        tab = {
          id,
          path,
          name,
          viewer: 'image',
          language: 'plain',
          readOnly: true,
          dirty: false,
          size: res.size,
          imageUrl: res.url
        }
        break
      case 'binary':
        tab = { id, path, name, viewer: 'binary', language: 'plain', readOnly: true, dirty: false, size: res.size }
        break
      case 'too-large':
        tab = { id, path, name, viewer: 'large', language: 'plain', readOnly: true, dirty: false, size: res.size }
        break
      case 'error':
        tab = {
          id,
          path,
          name,
          viewer: 'error',
          language: 'plain',
          readOnly: true,
          dirty: false,
          size: 0,
          errorMessage: res.message
        }
        break
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
  },

  activateTab: (id) => {
    if (get().tabs.some((t) => t.id === id)) set({ activeTabId: id })
  },

  closeTab: (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab) return
    if (tab.dirty) {
      set({ pendingCloseTabId: id })
      return
    }
    get().forceCloseTab(id)
  },

  forceCloseTab: (id) => {
    dropDoc(id)
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeTabId = s.activeTabId
      if (s.activeTabId === id) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null
      }
      return { tabs, activeTabId, pendingCloseTabId: null }
    })
  },

  closeAllTabs: () => {
    for (const t of get().tabs) dropDoc(t.id)
    set({ tabs: [], activeTabId: null, pendingCloseTabId: null })
  },

  markDirty: (id, dirty) => {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)) }))
  },

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || tab.viewer !== 'editor' || tab.readOnly) return false
    const content = currentDoc(id)
    const res = await window.api.fs.writeFile(tab.path, content)
    if (!res.ok) {
      toast('Save failed', { description: res.message, variant: 'danger' })
      return false
    }
    markSaved(id, content)
    get().markDirty(id, isDirtyNow(id))
    return true
  },

  saveActive: async () => {
    const id = get().activeTabId
    if (id) await get().saveTab(id)
  },

  saveAndCloseTab: async (id) => {
    const ok = await get().saveTab(id)
    if (ok) get().forceCloseTab(id)
    else set({ pendingCloseTabId: null })
  },

  setPendingClose: (id) => set({ pendingCloseTabId: id }),
  setPendingGoto: (goto) => set({ pendingGoto: goto }),

  openFileAtLocation: async (path, line, column) => {
    set({ pendingGoto: { path, line, column } })
    await get().openFile(path, basename(path))
  },

  updatePathsAfterRename: (oldPath, newPath, wasDir) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.path === oldPath) return { ...t, path: newPath, name: basename(newPath) }
        if (wasDir && t.path.startsWith(oldPath + '/')) {
          return { ...t, path: newPath + t.path.slice(oldPath.length) }
        }
        return t
      })
    }))
  },

  /** After a delete: clean tabs close; dirty ones stay (⌘S resurrects the file). */
  closeCleanTabsUnder: (path) => {
    const doomed = get().tabs.filter(
      (t) => !t.dirty && (t.path === path || t.path.startsWith(path + '/'))
    )
    for (const t of doomed) get().forceCloseTab(t.id)
  },

  reloadCleanTabFromDisk: async (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab || tab.viewer !== 'editor' || tab.dirty) return
    const res = await window.api.fs.openFile(path)
    if (res.type === 'text') {
      if (res.content !== currentDoc(tab.id)) {
        replaceDocContent(tab.id, res.content)
        get().markDirty(tab.id, false)
      }
    } else if (res.type === 'error' && res.code === 'ENOENT') {
      get().forceCloseTab(tab.id)
    }
  }
})
