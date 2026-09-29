import type { StateCreator } from 'zustand'
import { EditorSelection } from '@codemirror/state'
import { toast } from '@heroui/react'
import type { ProjectSession, SessionTab } from '@shared/types'
import { currentDoc, getDoc, isDirtyNow, seedDoc, liveView, activeDocTabId, saveScrollSnapshot } from '@/editor/doc-registry'
import { tabFromFileResult } from './tabs.slice'
import type { AppStore } from './index'
import type { TabMeta } from './app-types'

interface SnapshotOptions { discardDraftIds?: string[]; omitTabIds?: string[] }
interface GuardOptions { tabIds?: string[]; omitTabIds?: string[] }

export interface WorkspaceSlice {
  sessionReady: boolean
  transitionBusy: boolean
  backupError: string | null
  backupUpdatedAt: number | null
  setSessionReady: (ready: boolean) => void
  scheduleSessionSave: () => void
  flushSession: (options?: SnapshotOptions) => Promise<boolean>
  restoreSession: (session: ProjectSession | null) => Promise<void>
  runGuardedAction: (action: string, apply: () => Promise<void>, options?: GuardOptions) => Promise<boolean>
}

export const createWorkspaceSlice: StateCreator<AppStore, [], [], WorkspaceSlice> = (set, get) => {
  let backupTimer: ReturnType<typeof setTimeout> | null = null
  let backupGeneration = 0

  return {
    sessionReady: false, transitionBusy: false, backupError: null, backupUpdatedAt: null,
    setSessionReady: (ready) => set({ sessionReady: ready }),
    scheduleSessionSave: () => {
      // A throttle (not an idle debounce) also backs up continuous typing.
      if (!get().sessionReady || get().transitionBusy || !get().activeProjectId || backupTimer) return
      backupTimer = setTimeout(() => {
        backupTimer = null
        void get().flushSession()
      }, 1000)
    },
    flushSession: async (options = {}) => {
      if (backupTimer) { clearTimeout(backupTimer); backupTimer = null }
      const store = get()
      if (!store.sessionReady) return false
      if (!store.activeProjectId) return true
      const projectId = store.activeProjectId
      if (liveView && activeDocTabId) saveScrollSnapshot(activeDocTabId, liveView)
      const omit = new Set(options.omitTabIds)
      const discard = new Set(options.discardDraftIds)
      const tabs: SessionTab[] = store.tabs.filter((t) => !omit.has(t.id)).map((tab) => {
        const doc = getDoc(tab.id)
        const selection = doc?.state.selection.main
        const snapshot: SessionTab = {
          id: tab.id, path: tab.path, name: tab.name, language: tab.language,
          cursor: { anchor: selection?.anchor ?? 0, head: selection?.head ?? 0 },
          scrollTop: doc?.scrollTop ?? 0, scrollLeft: doc?.scrollLeft ?? 0,
          mdView: store.mdViewByTab[tab.id] ?? 'edit', svgPreview: store.svgPreviewByTab[tab.id] ?? false
        }
        if (doc && !discard.has(tab.id) && (isDirtyNow(tab.id) || tab.dirty || tab.conflict)) {
          snapshot.draft = { content: currentDoc(tab.id), savedContent: doc.savedDoc, revision: tab.revision ?? null }
        }
        return snapshot
      })
      const session: ProjectSession = {
        version: 1, tabs,
        activeTabId: tabs.some((t) => t.id === store.activeTabId) ? store.activeTabId : tabs[0]?.id ?? null,
        expanded: Object.keys(store.expanded), selectedPath: store.selectedPath, sidebarWidth: store.sidebarWidth
      }
      const generation = ++backupGeneration
      try {
        const result = await window.api.sessions.save(projectId, session)
        if (!result.ok) throw new Error(result.message)
        if (generation === backupGeneration) set({ backupError: null, backupUpdatedAt: Date.now() })
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (generation === backupGeneration) set({ backupError: message })
        return false
      }
    },
    restoreSession: async (session) => {
      if (backupTimer) { clearTimeout(backupTimer); backupTimer = null }
      set({ sessionReady: false, backupError: null, backupUpdatedAt: null })
      get().closeAllTabs()
      get().resetTree()
      set({ mdViewByTab: {}, svgPreviewByTab: {}, pendingGoto: null })
      if (session) {
        const tabs: TabMeta[] = []
        const seen = new Set<string>()
        for (const saved of session.tabs) {
          if (seen.has(saved.path)) continue
          seen.add(saved.path)
          let disk
          try { disk = await window.api.fs.openFile(saved.path) }
          catch (err) { disk = { type: 'error' as const, code: 'UNKNOWN' as const, message: String(err) } }
          const tab = tabFromFileResult(saved.path, saved.name, saved.id, disk)
          if (saved.draft) {
            const draft = saved.draft
            // A completed save may have reached disk just before a crash, while
            // the older draft snapshot was still the most recent backup.
            const savedDisk = disk.type === 'text' && disk.content === draft.content ? disk : null
            const alreadySaved = savedDisk !== null
            seedDoc(tab.id, savedDisk?.content ?? draft.content, saved.language, false)
            const entry = getDoc(tab.id)!
            entry.savedDoc = savedDisk?.content ?? draft.savedContent
            Object.assign(tab, {
              viewer: 'editor', language: saved.language, readOnly: false,
              revision: savedDisk?.revision ?? draft.revision,
              dirty: !alreadySaved && draft.content !== draft.savedContent,
              recovered: !alreadySaved, errorMessage: undefined
            })
            if (!alreadySaved) {
              if (disk.type === 'text' && disk.revision !== draft.revision) {
                tab.conflict = { type: 'changed', diskContent: disk.content, diskRevision: disk.revision }
              } else if (disk.type !== 'text') {
                tab.conflict = {
                  type: disk.type === 'error' && disk.code === 'ENOENT' ? 'missing' : 'unavailable',
                  message: disk.type === 'error' ? disk.message : 'The original file is no longer readable as text.'
                }
              }
            }
          }
          const entry = getDoc(tab.id)
          if (entry) {
            const length = entry.state.doc.length
            entry.state = entry.state.update({ selection: EditorSelection.single(
              Math.min(saved.cursor.anchor, length), Math.min(saved.cursor.head, length)
            ) }).state
            entry.scrollTop = saved.scrollTop
            entry.scrollLeft = saved.scrollLeft
          }
          tabs.push(tab)
        }
        const expanded = Object.fromEntries(session.expanded.map((path) => [path, true as const]))
        set({
          tabs, activeTabId: tabs.some((t) => t.id === session.activeTabId) ? session.activeTabId : tabs[0]?.id ?? null,
          expanded, selectedPath: session.selectedPath, sidebarWidth: session.sidebarWidth,
          mdViewByTab: Object.fromEntries(session.tabs.map((t) => [t.id, t.mdView])),
          svgPreviewByTab: Object.fromEntries(session.tabs.map((t) => [t.id, t.svgPreview]))
        })
        await Promise.all(session.expanded.map((path) => get().loadDir(path)))
        const recovered = tabs.filter((t) => t.recovered).length
        if (recovered) toast('Drafts recovered', {
          description: `${recovered} unsaved ${recovered === 1 ? 'document has' : 'documents have'} been restored. Original files have not been overwritten.`,
          variant: 'warning'
        })
      }
      set({ sessionReady: true })
      get().syncWatcherRoots()
    },
    runGuardedAction: async (action, apply, options = {}) => {
      if (get().transitionBusy || !get().sessionReady) return false
      set({ transitionBusy: true })
      if (backupTimer) { clearTimeout(backupTimer); backupTimer = null }
      try {
        const ids = new Set(options.tabIds ?? get().tabs.map((t) => t.id))
        const unsaved = get().tabs.filter((t) => ids.has(t.id) && (t.dirty || t.conflict || isDirtyNow(t.id)))
        let discardDraftIds: string[] = []
        if (unsaved.length) {
          const choice = await window.api.dialog.confirmUnsaved(unsaved.map((t) => t.name), action)
          if (choice === 'cancel') return false
          if (choice === 'save') {
            for (const tab of unsaved) if (!await get().saveTab(tab.id)) return false
            if (get().tabs.some((t) => ids.has(t.id) && (t.dirty || t.conflict || isDirtyNow(t.id)))) {
              toast('New changes need saving', { description: 'The action was cancelled to keep your latest edits.', variant: 'warning' })
              return false
            }
          } else discardDraftIds = unsaved.map((t) => t.id)
        }
        if (!await get().flushSession({ discardDraftIds, omitTabIds: options.omitTabIds })) {
          toast('Could not back up workspace', { description: 'The action was cancelled. Your open documents are still available. Retry after fixing the backup error.', variant: 'danger' })
          return false
        }
        await apply()
        return true
      } catch (err) {
        toast('Action could not complete', { description: err instanceof Error ? err.message : String(err), variant: 'danger' })
        return false
      } finally {
        set({ transitionBusy: false })
        get().scheduleSessionSave()
      }
    }
  }
}
