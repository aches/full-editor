import type { StateCreator } from 'zustand'
import { toast } from '@heroui/react'
import { languageFor } from '@shared/file-kinds'
import type { FileOpenResult } from '@shared/types'
import {
  currentDoc, dropDoc, getDoc, isDirtyNow, markSaved,
  replaceDocContent, seedDoc, setDocReadOnly, syncLanguageToView, liveView, activeDocTabId
} from '@/editor/doc-registry'
import { languageComp, wrapComp, shouldWrap } from '@/editor/cm-base'
import { EditorView } from '@codemirror/view'
import { basename } from '@/lib/paths'
import type { AppStore } from './index'
import type { TabMeta } from './app-types'

export interface PendingGoto { path: string; line: number; column: number }

/** The same disk-to-tab conversion is used for normal opens and session restore. */
export function tabFromFileResult(path: string, name: string, id: string, res: FileOpenResult): TabMeta {
  const tab: TabMeta = {
    id, path, name, viewer: 'error', language: languageFor(name),
    readOnly: true, dirty: false, size: 'size' in res ? res.size : 0
  }
  if (res.type === 'text') {
    seedDoc(id, res.content, tab.language, res.readOnly)
    Object.assign(tab, { viewer: 'editor', readOnly: res.readOnly, revision: res.revision })
  } else if (res.type === 'image') {
    Object.assign(tab, { viewer: 'image', imageUrl: res.url })
  } else if (res.type === 'binary') tab.viewer = 'binary'
  else if (res.type === 'too-large') tab.viewer = 'large'
  else tab.errorMessage = res.message
  return tab
}

export interface TabsSlice {
  tabs: TabMeta[]
  activeTabId: string | null
  pendingGoto: PendingGoto | null
  conflictTabId: string | null
  activeTab: () => TabMeta | undefined
  openFile: (path: string, name: string) => Promise<void>
  openFileAtLocation: (path: string, line: number, column: number) => Promise<void>
  activateTab: (id: string) => void
  closeTab: (id: string) => Promise<void>
  forceCloseTab: (id: string) => void
  closeAllTabs: () => void
  markDirty: (id: string, dirty: boolean) => void
  saveTab: (id: string) => Promise<boolean>
  saveTabAs: (id: string) => Promise<boolean>
  saveAllTabs: () => Promise<boolean>
  saveActive: () => Promise<void>
  setPendingGoto: (goto: PendingGoto | null) => void
  setConflictTab: (id: string | null) => void
  inspectDiskConflict: (id: string) => Promise<void>
  resolveDiskConflict: (id: string, action: 'reload' | 'overwrite' | 'save-as') => Promise<boolean>
  updatePathsAfterRename: (oldPath: string, newPath: string, wasDir: boolean) => void
  closeCleanTabsUnder: (path: string) => void
  reloadCleanTabFromDisk: (path: string) => Promise<void>
}

export const createTabsSlice: StateCreator<AppStore, [], [], TabsSlice> = (set, get) => {
  const opening = new Map<string, Promise<void>>()
  const saving = new Map<string, Promise<boolean>>()
  const diskChecks = new Map<string, number>()

  // Serialize each tab's writes and retain the exact snapshot used by that write.
  const writeTab = async (id: string, saveAs: boolean, revision?: string | null): Promise<boolean> => {
    const previous = saving.get(id)
    if (previous) {
      const ok = await previous
      if (!saveAs && !get().tabs.find((t) => t.id === id)?.dirty) return ok
      return writeTab(id, saveAs, revision)
    }
    const tab = get().tabs.find((t) => t.id === id)
    if (!tab || tab.viewer !== 'editor' || (tab.readOnly && !saveAs)) return false
    const content = currentDoc(id)
    set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, saving: true } : t) }))
    const work = (async (): Promise<boolean> => {
      try {
        const res = saveAs
          ? await window.api.fs.saveAs(tab.path, content, get().tabs.filter((t) => t.id !== id).map((t) => t.path))
          : await window.api.fs.writeFile(tab.path, content, { expectedRevision: revision === undefined ? tab.revision ?? null : revision })
        if (!res.ok) {
          if (res.code === 'CONFLICT') {
            // Permit the explicit read below while this save is ending.
            set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, saving: false } : t) }))
            await get().inspectDiskConflict(id)
          } else if (res.code !== 'CANCELLED') {
            toast('Save failed', { description: res.message, variant: 'danger' })
          }
          return false
        }
        const stillOpen = get().tabs.find((t) => t.id === id)
        if (!stillOpen || stillOpen.path !== tab.path) return false
        markSaved(id, content)
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === id ? {
            ...t, path: res.path, name: basename(res.path), revision: res.revision,
            dirty: isDirtyNow(id), conflict: undefined, recovered: false,
            size: new TextEncoder().encode(content).length
          } : t),
          conflictTabId: s.conflictTabId === id ? null : s.conflictTabId
        }))
        if (saveAs) {
          get().updatePathsAfterRename(tab.path, res.path, false)
          get().syncWatcherRoots()
        }
        get().scheduleSessionSave()
        return true
      } catch (err) {
        toast('Save failed', { description: err instanceof Error ? err.message : String(err), variant: 'danger' })
        return false
      } finally {
        set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, saving: false } : t) }))
      }
    })()
    saving.set(id, work)
    try { return await work } finally { if (saving.get(id) === work) saving.delete(id) }
  }

  return {
    tabs: [], activeTabId: null, pendingGoto: null, conflictTabId: null,
    activeTab: () => get().tabs.find((t) => t.id === get().activeTabId),

    openFile: async (path, name) => {
      if (get().transitionBusy || !get().sessionReady) return
      const existing = get().tabs.find((t) => t.path === path)
      if (existing) { set({ activeTabId: existing.id }); return }
      if (opening.has(path)) { await opening.get(path); return }
      const projectId = get().activeProjectId
      const work = (async () => {
        try {
          const res = await window.api.fs.openFile(path)
          if (get().activeProjectId !== projectId || get().transitionBusy || !get().sessionReady) return
          const tab = tabFromFileResult(path, name, crypto.randomUUID(), res)
          set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
        } catch (err) {
          toast('Could not open file', { description: String(err), variant: 'danger' })
        }
      })()
      opening.set(path, work)
      try { await work } finally { opening.delete(path) }
    },
    activateTab: (id) => {
      if (!get().transitionBusy && get().tabs.some((t) => t.id === id)) set({ activeTabId: id })
    },
    closeTab: async (id) => {
      if (!get().tabs.some((t) => t.id === id)) return
      await get().runGuardedAction('closing this tab', async () => { get().forceCloseTab(id) }, { tabIds: [id], omitTabIds: [id] })
    },
    forceCloseTab: (id) => {
      dropDoc(id)
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id)
        const tabs = s.tabs.filter((t) => t.id !== id)
        return {
          tabs, activeTabId: s.activeTabId === id ? tabs[Math.min(idx, tabs.length - 1)]?.id ?? null : s.activeTabId,
          conflictTabId: s.conflictTabId === id ? null : s.conflictTabId
        }
      })
    },
    closeAllTabs: () => {
      for (const t of get().tabs) dropDoc(t.id)
      set({ tabs: [], activeTabId: null, conflictTabId: null })
    },
    markDirty: (id, dirty) => {
      set((s) => ({ tabs: s.tabs.map((t) => t.id === id ? { ...t, dirty } : t) }))
    },
    saveTab: (id) => writeTab(id, false),
    saveTabAs: (id) => writeTab(id, true),
    saveAllTabs: async () => {
      for (const t of get().tabs.filter((t) => t.dirty || t.conflict)) {
        if (!await get().saveTab(t.id)) return false
      }
      return !get().tabs.some((t) => t.dirty || t.conflict)
    },
    saveActive: async () => { const id = get().activeTabId; if (id) await get().saveTab(id) },
    setPendingGoto: (goto) => set({ pendingGoto: goto }),
    setConflictTab: (id) => set({ conflictTabId: id }),
    openFileAtLocation: async (path, line, column) => {
      await get().openFile(path, basename(path))
      if (get().activeTab()?.path === path) set({ pendingGoto: { path, line, column } })
    },
    inspectDiskConflict: async (id) => {
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab) return
      await get().reloadCleanTabFromDisk(tab.path)
      if (get().tabs.find((t) => t.id === id)?.conflict) set({ conflictTabId: id, activeTabId: id })
    },
    resolveDiskConflict: async (id, action) => {
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab?.conflict || tab.saving) return false
      if (action === 'save-as') return get().saveTabAs(id)
      if (action === 'overwrite') {
        if (tab.conflict.type === 'unavailable') return false
        return writeTab(id, false, tab.conflict.type === 'missing' ? null : tab.conflict.diskRevision)
      }
      // Re-read before reload; don't apply an obsolete comparison snapshot.
      try {
        const res = await window.api.fs.openFile(tab.path)
        if (res.type !== 'text' || res.revision !== tab.conflict.diskRevision) {
          await get().inspectDiskConflict(id)
          toast('File changed again', { description: 'Review the latest disk contents before reloading.', variant: 'warning' })
          return false
        }
        replaceDocContent(id, res.content)
        setDocReadOnly(id, res.readOnly)
        set((s) => ({
          tabs: s.tabs.map((t) => t.id === id ? { ...t, dirty: false, recovered: false, conflict: undefined, revision: res.revision, size: res.size, readOnly: res.readOnly } : t),
          conflictTabId: null
        }))
        await get().flushSession()
        return true
      } catch (err) {
        toast('Could not reload', { description: String(err), variant: 'danger' })
        return false
      }
    },
    updatePathsAfterRename: (oldPath, newPath, wasDir) => {
      set((s) => ({ tabs: s.tabs.map((t) => {
        if (t.path === oldPath) return { ...t, path: newPath, name: basename(newPath) }
        if (wasDir && t.path.startsWith(oldPath + '/')) return { ...t, path: newPath + t.path.slice(oldPath.length) }
        return t
      }) }))
      for (const tab of get().tabs) {
        if (tab.path !== newPath && !(wasDir && tab.path.startsWith(newPath + '/'))) continue
        const language = languageFor(tab.name)
        const entry = getDoc(tab.id)
        if (!entry || entry.language === language) continue
        entry.language = language
        const effects = [languageComp.reconfigure([]), wrapComp.reconfigure(shouldWrap(language) ? EditorView.lineWrapping : [])]
        if (activeDocTabId === tab.id && liveView) liveView.dispatch({ effects })
        else entry.state = entry.state.update({ effects }).state
        set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id ? { ...t, language } : t) }))
        if (activeDocTabId === tab.id && liveView) void syncLanguageToView(tab.id, liveView)
      }
    },
    closeCleanTabsUnder: (path) => {
      // Preserve the in-memory contents even when an entire directory disappears.
      for (const tab of get().tabs) {
        if (tab.path === path || tab.path.startsWith(path + '/')) void get().reloadCleanTabFromDisk(tab.path)
      }
    },
    reloadCleanTabFromDisk: async (path) => {
      const original = get().tabs.find((t) => t.path === path)
      if (!original || original.viewer !== 'editor' || original.saving) return
      const serial = (diskChecks.get(original.id) ?? 0) + 1
      diskChecks.set(original.id, serial)
      let res: FileOpenResult
      try { res = await window.api.fs.openFile(path) }
      catch (err) { res = { type: 'error', code: 'UNKNOWN', message: String(err) } }
      const tab = get().tabs.find((t) => t.id === original.id)
      if (!tab || tab.path !== path || tab.saving || tab.revision !== original.revision || diskChecks.get(tab.id) !== serial) return
      if (res.type === 'text') {
        if (res.revision === tab.revision) {
          if (tab.conflict) set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id ? { ...t, conflict: undefined } : t) }))
          return
        }
        if (tab.dirty || isDirtyNow(tab.id) || tab.conflict || get().transitionBusy) {
          set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id ? {
            ...t, conflict: { type: 'changed', diskContent: res.content, diskRevision: res.revision }
          } : t) }))
        } else {
          replaceDocContent(tab.id, res.content)
          setDocReadOnly(tab.id, res.readOnly)
          set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id ? { ...t, dirty: false, revision: res.revision, size: res.size, readOnly: res.readOnly } : t) }))
        }
      } else {
        const missing = res.type === 'error' && res.code === 'ENOENT'
        set((s) => ({ tabs: s.tabs.map((t) => t.id === tab.id ? {
          ...t, conflict: { type: missing ? 'missing' : 'unavailable', message: res.type === 'error' ? res.message : 'The disk file can no longer be read as editable text.' }
        } : t) }))
      }
      get().scheduleSessionSave()
    }
  }
}
