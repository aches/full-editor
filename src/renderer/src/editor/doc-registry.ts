import type { EditorState, StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { LanguageId } from '@shared/file-kinds'
import { applyLanguageToState, buildEditorState, languageComp } from './cm-base'
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
  docs.set(tabId, {
    state: buildEditorState(content, language, readOnly),
    savedDoc: content,
    language,
    readOnly,
    scrollEffect: null
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
  if (entry) entry.scrollEffect = view.scrollSnapshot()
}

/** Re-apply a previously saved scroll position (no-op when none saved). */
export function restoreScroll(tabId: string, view: EditorView): void {
  const entry = docs.get(tabId)
  if (entry?.scrollEffect) view.dispatch({ effects: entry.scrollEffect })
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
  entry.savedDoc = content
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
  const ext = await loadLanguage(entry.language)
  if (!ext) return
  if (activeDocTabId !== tabId || !languageMissingIn(view.state)) return
  view.dispatch({ effects: languageComp.reconfigure(ext) })
  // Belt-and-braces for a dead-view dispatch: make sure the stored state
  // carries the language too.
  const current = docs.get(tabId)
  if (current && languageMissingIn(current.state)) {
    current.state = applyLanguageToState(current.state, ext)
  }
}
