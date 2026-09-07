import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * Everything references CSS variables, so switching data-theme restyles the
 * editor instantly with no state reconfiguration. The --cm-* palette lives
 * in styles/editor.css.
 */
const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: '13px'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.65'
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: '12px 0'
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    {
      backgroundColor: 'var(--accent-soft) !important'
    },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--cm-gutter)',
    border: 'none',
    paddingLeft: '8px'
  },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '3.2ch' },
  '&.cm-focused': { outline: 'none' },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--accent-soft)',
    outline: '1px solid var(--accent)'
  },
  '.cm-searchMatch': { backgroundColor: 'var(--warning-soft)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--warning)' },
  '.cm-panels': {
    backgroundColor: 'var(--overlay)',
    color: 'var(--foreground)',
    borderTop: '1px solid var(--separator)'
  },
  '.cm-panel input, .cm-panel button': { fontFamily: 'var(--font-ui)' }
})

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'var(--cm-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--cm-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--cm-type)' },
  { tag: [t.propertyName, t.attributeName, t.definition(t.variableName)], color: 'var(--cm-property)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--cm-tag)' },
  { tag: [t.meta, t.processingInstruction, t.punctuation], color: 'var(--cm-meta)' },
  { tag: [t.link, t.url], color: 'var(--cm-link)', textDecoration: 'underline' },
  { tag: t.heading, color: 'var(--cm-heading)', fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.regexp, t.escape], color: 'var(--cm-regexp)' },
  { tag: t.invalid, color: 'var(--danger)' }
])

export function editorTheme(): Extension {
  return [baseTheme, syntaxHighlighting(highlight)]
}
