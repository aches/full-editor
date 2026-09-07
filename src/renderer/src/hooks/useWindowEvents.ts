import { useEffect } from 'react'
import { useStore } from '@/stores'

/** Wire main-process push events + global shortcuts once at app root. */
export function useWindowEvents(): void {
  useEffect(() => {
    const offMini = window.api.events.onMiniModeChanged((on) => {
      useStore.getState().applyMiniMode(on)
    })
    const offTheme = window.api.events.onSystemThemeChanged((dark) => {
      useStore.getState().setSystemDark(dark)
    })
    const offSave = window.api.events.onSaveActiveTab(() => {
      void useStore.getState().saveActive()
    })
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
      offClose()
      offFsChanged()
      offOpenSearch()
      offOpenQuickOpen()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
