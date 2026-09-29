import type { EditorState, StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { LanguageId } from '@shared/file-kinds'
import { EditorState as CMState } from '@codemirror/state'
import { applyLanguageToState, buildEditorState, languageComp, readOnlyComp } from './cm-base'
import { loadLanguage } from './languages'

/**
 * File contents and editor states live here, OUTSIDE zustand — the store only
 * carries booleans (dirty flags) so keystrokes never churn React state.
 */
export interface DocEntry {
  state: EditorState
  savedDoc: string
  language: LanguageId
  readOnly: boolean
  /** Captured on tab switch-away; EditorState does not carry scroll position. */
  scrollEffect: StateEffect<unknown> | null
  scrollTop: number
  scrollLeft: number
}

const docs = new Map<string, DocEntry>()

/** The tab whose state is currently mounted in the single EditorView. */
export let activeDocTabId: string | null = null
export function setActiveDocTabId(tabId: string | null): void {
  activeDocTabId = tabId
}

/** The single live EditorView (owned by EditorHost while mounted). */
export let liveView: EditorView | null = null
export function setLiveView(view: EditorView | null): void {
  liveView = view
}

type DocChangeListener = (tabId: string) => void
const docChangeListeners = new Set<DocChangeListener>()

/** Subscribe to committed document changes (used by the live markdown preview). */
export function subscribeDocChanges(cb: DocChangeListener): () => void {
  docChangeListeners.add(cb)
  return () => docChangeListeners.delete(cb)
}

export function notifyDocChanged(tabId: string): void {
  for (const cb of docChangeListeners) cb(tabId)
}

export function seedDoc(tabId: string, content: string, language: LanguageId, readOnly: boolean): void {
  const state = buildEditorState(content, language, readOnly)
  docs.set(tabId, {
    state,
    savedDoc: state.doc.toString(),
    language,
    readOnly,
    scrollEffect: null,
    scrollTop: 0,
    scrollLeft: 0
  })
}

export function getDoc(tabId: string): DocEntry | undefined {
  return docs.get(tabId)
}

export function putState(tabId: string, state: EditorState): void {
  const entry = docs.get(tabId)
  if (entry) entry.state = state
}

export function currentDoc(tabId: string): string {
  return docs.get(tabId)?.state.doc.toString() ?? ''
}

/** Snapshot the live view's scroll position into the tab's registry entry. */
export function saveScrollSnapshot(tabId: string, view: EditorView): void {
  const entry = docs.get(tabId)
  if (entry) {
    entry.scrollEffect = view.scrollSnapshot()
    entry.scrollTop = view.scrollDOM.scrollTop
    entry.scrollLeft = view.scrollDOM.scrollLeft
  }
}

/** Re-apply a previously saved scroll position (no-op when none saved). */
export function restoreScroll(tabId: string, view: EditorView): void {
  const entry = docs.get(tabId)
  if (entry?.scrollEffect) view.dispatch({ effects: entry.scrollEffect })
  else if (entry) {
    const { scrollTop, scrollLeft } = entry
    view.scrollDOM.scrollTop = scrollTop
    view.scrollDOM.scrollLeft = scrollLeft
    view.requestMeasure({
      read: () => null,
      write: () => {
        if (activeDocTabId === tabId) {
          view.scrollDOM.scrollTop = scrollTop
          view.scrollDOM.scrollLeft = scrollLeft
        }
      }
    })
  }
}

export function markSaved(tabId: string, content: string): void {
  const entry = docs.get(tabId)
  if (entry) entry.savedDoc = content
}

export function isDirtyNow(tabId: string): boolean {
  const entry = docs.get(tabId)
  if (!entry) return false
  return entry.state.doc.toString() !== entry.savedDoc
}

export function dropDoc(tabId: string): void {
  docs.delete(tabId)
  if (activeDocTabId === tabId) activeDocTabId = null
}

/** Keep the active view and parked state consistent when disk size changes. */
export function setDocReadOnly(tabId: string, readOnly: boolean): void {
  const entry = docs.get(tabId)
  if (!entry || entry.readOnly === readOnly) return
  entry.readOnly = readOnly
  const effects = readOnlyComp.reconfigure(CMState.readOnly.of(readOnly))
  if (activeDocTabId === tabId && liveView) liveView.dispatch({ effects })
  else entry.state = entry.state.update({ effects }).state
}

/**
 * Replace the whole document with fresh disk content (external change picked
 * up by the watcher). Marks the new content as the saved baseline.
 */
export function replaceDocContent(tabId: string, content: string): void {
  const entry = docs.get(tabId)
  if (!entry) return
  if (activeDocTabId === tabId && liveView) {
    liveView.dispatch({
      changes: { from: 0, to: liveView.state.doc.length, insert: content }
    })
  } else {
    entry.state = entry.state.update({
      changes: { from: 0, to: entry.state.doc.length, insert: content }
    }).state
  }
  entry.savedDoc = entry.state.doc.toString()
  notifyDocChanged(tabId)
}

function languageMissingIn(state: EditorState): boolean {
  const content = languageComp.get(state)
  return Array.isArray(content) && content.length === 0
}

/**
 * Load (dynamic import, cached) and apply the tab's language to the LIVE
 * view. Applied-ness is read from the view's own state each time, so the
 * async continuation stays correct across view teardown/remount (React
 * StrictMode double-effects) and concurrent calls — a dispatch that landed
 * on a destroyed view simply leaves the next call something to do. The
 * update listener writes the reconfigured state back to the registry.
 */
export async function syncLanguageToView(tabId: string, view: EditorView): Promise<void> {
  const entry = docs.get(tabId)
  if (!entry || entry.language === 'plain' || !languageMissingIn(view.state)) return
  const language = entry.language
  const ext = await loadLanguage(language)
  if (!ext) return
  if (docs.get(tabId) !== entry || entry.language !== language || activeDocTabId !== tabId || !languageMissingIn(view.state)) return
  view.dispatch({ effects: languageComp.reconfigure(ext) })
  // Belt-and-braces for a dead-view dispatch: make sure the stored state
  // carries the language too.
  const current = docs.get(tabId)
  if (current && languageMissingIn(current.state)) {
    current.state = applyLanguageToState(current.state, ext)
  }
}
