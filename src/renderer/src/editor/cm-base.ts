import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import type { LanguageId } from '@shared/file-kinds'
import { editorTheme } from './cm-theme'

/**
 * Shared compartments — one EditorView, many EditorStates. Each state embeds
 * its own configuration for these compartments; reconfigure affects only the
 * state it is dispatched against.
 */
export const languageComp = new Compartment()
export const readOnlyComp = new Compartment()
export const wrapComp = new Compartment()

const WRAPPED_LANGUAGES: ReadonlySet<LanguageId> = new Set(['markdown', 'log', 'plain'])

export function shouldWrap(language: LanguageId): boolean {
  return WRAPPED_LANGUAGES.has(language)
}

export interface EditorHooks {
  onDocChanged: (state: EditorState, docChanged: boolean) => void
}

/** Set by EditorHost; kept outside React so CM extensions can reach it. */
export const editorHooks: EditorHooks = {
  onDocChanged: () => {}
}

const updateListener = EditorView.updateListener.of((update) => {
  editorHooks.onDocChanged(update.state, update.docChanged)
})

export function buildEditorState(doc: string, language: LanguageId, readOnly: boolean): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      editorTheme(),
      updateListener,
      languageComp.of([]),
      readOnlyComp.of(EditorState.readOnly.of(readOnly)),
      wrapComp.of(shouldWrap(language) ? EditorView.lineWrapping : [])
    ]
  })
}

export function applyLanguageToState(state: EditorState, ext: Extension): EditorState {
  return state.update({ effects: languageComp.reconfigure(ext) }).state
}
