import { useEffect } from 'react'
import { useStore } from '@/stores'
import { basename } from '@/lib/paths'

/** Wire main-process push events + global shortcuts once at app root. */
export function useWindowEvents(): void {
  useEffect(() => {
    let allowUnload = false
    const offMini = window.api.events.onMiniModeChanged((on) => {
      useStore.getState().applyMiniMode(on)
    })
    const offTheme = window.api.events.onSystemThemeChanged((dark) => {
      useStore.getState().setSystemDark(dark)
    })
    const offSave = window.api.events.onSaveActiveTab(() => {
      if (!useStore.getState().transitionBusy) void useStore.getState().saveActive()
    })
    const offExport = window.api.events.onExportActiveTab((format) => {
      void import('@/lib/export-document').then(({ exportTab }) => exportTab(format))
    })
    const offSaveAll = window.api.events.onSaveAllTabs(() => {
      if (!useStore.getState().transitionBusy) void useStore.getState().saveAllTabs()
    })
    const offSaveAs = window.api.events.onSaveAsActiveTab(() => {
      const store = useStore.getState()
      if (store.activeTabId && !store.transitionBusy) void store.saveTabAs(store.activeTabId)
    })
    const offRequestClose = window.api.events.onRequestClose((request) => {
      void (async () => {
        const store = useStore.getState()
        if (!store.sessionReady && !store.transitionBusy && store.tabs.length === 0) {
          // Failed startup must remain closable without touching recovery files.
          allowUnload = true
          await window.api.window.respondClose(request.id, true)
          return
        }
        const allowed = await store.runGuardedAction(
          request.reason === 'reload' ? 'reloading the editor' : 'closing the editor',
          async () => {
            // No further scheduled snapshot may resurrect explicitly discarded drafts.
            allowUnload = true
            useStore.getState().setSessionReady(false)
            const accepted = await window.api.window.respondClose(request.id, true)
            if (!accepted) {
              allowUnload = false
              useStore.getState().setSessionReady(true)
            }
          }
        )
        if (!allowed) {
          allowUnload = false
          await window.api.window.respondClose(request.id, false)
        }
      })()
    })
    // Files opened from Finder can arrive before the session finishes restoring.
    const waitingExternal: string[] = []
    const drainExternal = (): void => {
      const store = useStore.getState()
      if (!store.sessionReady || store.transitionBusy) return
      for (const path of waitingExternal.splice(0)) void store.openFile(path, basename(path))
    }
    const offOpenExternal = window.api.events.onOpenExternalFile((path) => {
      waitingExternal.push(path)
      drainExternal()
    })
    void window.api.app.takePendingOpenFiles().then((paths) => {
      waitingExternal.push(...paths)
      drainExternal()
    })
    const offWorkspace = useStore.subscribe((state, previous) => {
      if (waitingExternal.length && state.sessionReady && !state.transitionBusy &&
        (!previous.sessionReady || previous.transitionBusy)) drainExternal()
      if (state.tabs !== previous.tabs || state.activeTabId !== previous.activeTabId ||
        state.expanded !== previous.expanded || state.selectedPath !== previous.selectedPath ||
        state.sidebarWidth !== previous.sidebarWidth || state.mdViewByTab !== previous.mdViewByTab ||
        state.svgPreviewByTab !== previous.svgPreviewByTab) state.scheduleSessionSave()
    })
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!allowUnload && useStore.getState().tabs.some((tab) => tab.dirty || tab.conflict)) {
        event.preventDefault()
        event.returnValue = ''
        void useStore.getState().flushSession()
      }
    }
    const onBlur = (): void => {
      const store = useStore.getState()
      if (store.sessionReady && !store.transitionBusy) void store.flushSession()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('blur', onBlur)
    const offClose = window.api.events.onCloseActiveTab(() => {
      const store = useStore.getState()
      if (store.activeTabId) store.closeTab(store.activeTabId)
    })
    const offFsChanged = window.api.events.onFsChanged((payload) => {
      useStore.getState().applyFsChanges(payload)
    })
    const offOpenSearch = window.api.events.onOpenSearch(() => {
      useStore.getState().focusSearch()
    })
    const offOpenQuickOpen = window.api.events.onOpenQuickOpen(() => {
      useStore.getState().setQuickOpenVisible(true)
    })

    const onKeyDown = (e: KeyboardEvent): void => {
      // ⌘1..9 — activate the Nth tab.
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const store = useStore.getState()
        const tab = store.tabs[Number(e.key) - 1]
        if (tab) {
          store.activateTab(tab.id)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      offMini()
      offTheme()
      offSave()
      offExport()
      offSaveAll()
      offSaveAs()
      offRequestClose()
      offWorkspace()
      offOpenExternal()
      offClose()
      offFsChanged()
      offOpenSearch()
      offOpenQuickOpen()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
