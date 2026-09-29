import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { useStore } from '@/stores'
import { editorHooks } from './cm-base'
import {
  activeDocTabId,
  getDoc,
  isDirtyNow,
  notifyDocChanged,
  putState,
  restoreScroll,
  saveScrollSnapshot,
  setActiveDocTabId,
  setLiveView,
  syncLanguageToView
} from './doc-registry'

/**
 * The app's single EditorView. Tab switches swap EditorStates in and out of
 * this one view — no remount cost, per-tab cursor/scroll preserved.
 */
export default function EditorHost({ tabId }: { tabId: string }): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const shownTabRef = useRef<string | null>(null)
  const pendingGoto = useStore((s) => s.pendingGoto)

  useEffect(() => {
    const view = new EditorView({ parent: containerRef.current! })
    viewRef.current = view
    setLiveView(view)
    editorHooks.onDocChanged = (state, docChanged) => {
      const id = activeDocTabId
      if (!id) return
      putState(id, state)
      if (docChanged) {
        const store = useStore.getState()
        const tab = store.tabs.find((t) => t.id === id)
        const dirty = isDirtyNow(id)
        if (tab && tab.dirty !== dirty) store.markDirty(id, dirty)
        notifyDocChanged(id)
      }
      useStore.getState().scheduleSessionSave()
    }
    const onScroll = (): void => {
      if (activeDocTabId) saveScrollSnapshot(activeDocTabId, view)
      useStore.getState().scheduleSessionSave()
    }
    view.scrollDOM.addEventListener('scroll', onScroll)
    return () => {
      // Keep the scroll position across unmounts (mini mode, viewer swaps).
      if (shownTabRef.current) saveScrollSnapshot(shownTabRef.current, view)
      editorHooks.onDocChanged = () => {}
      setActiveDocTabId(null)
      setLiveView(null)
      viewRef.current = null
      view.scrollDOM.removeEventListener('scroll', onScroll)
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    const entry = getDoc(tabId)
    if (!view || !entry) return
    // The view still shows the outgoing tab here — capture its scroll first.
    if (shownTabRef.current && shownTabRef.current !== tabId) {
      saveScrollSnapshot(shownTabRef.current, view)
    }
    shownTabRef.current = tabId
    setActiveDocTabId(tabId)
    view.setState(entry.state)
    restoreScroll(tabId, view)
    view.focus()
    void syncLanguageToView(tabId, view)
  }, [tabId])

  // Jump to a search result location once the right tab is in the view.
  useEffect(() => {
    if (!pendingGoto) return
    const view = viewRef.current
    const store = useStore.getState()
    const tab = store.tabs.find((t) => t.id === tabId)
    if (!view || !tab || tab.path !== pendingGoto.path) return
    const doc = view.state.doc
    const line = doc.line(Math.min(Math.max(1, pendingGoto.line), doc.lines))
    const pos = Math.min(line.from + pendingGoto.column, line.to)
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: 'center' })
    })
    view.focus()
    store.setPendingGoto(null)
  }, [pendingGoto, tabId])

  return <div ref={containerRef} className="editor-host h-full min-h-0" />
}
