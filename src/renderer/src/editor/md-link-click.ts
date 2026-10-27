import { EditorSelection, type EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { activeDocTabId } from './doc-registry'

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode']

const LINK_NODES = new Set(['Link', 'Image', 'Autolink', 'LinkReference'])

/** The href of the markdown link at `pos`, resolving `[text][ref]` definitions. */
function linkAt(state: EditorState, pos: number): string | null {
  const text = (n: SyntaxNode): string => state.sliceDoc(n.from, n.to)
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'URL') return text(node)
    if (!LINK_NODES.has(node.name)) continue
    const url = node.getChild('URL')
    if (url) return text(url)
    const label = node.getChild('LinkLabel')
    if (!label) return null
    const wanted = text(label).toLowerCase()
    const defs = state.doc.toString().matchAll(/^ {0,3}(\[[^\]]+\]):[ \t]*(\S+)/gm)
    for (const [, l, href] of defs) if (l.toLowerCase() === wanted) return href
    return null
  }
  return null
}

/** Cmd/Ctrl+click follows the link under the pointer. */
export const markdownLinkClick = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || !(event.metaKey || event.ctrlKey)) return false
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    const href = pos === null ? null : linkAt(view.state, pos)
    const tabId = activeDocTabId
    if (!href || !tabId) return false
    event.preventDefault()
    void import('@/lib/follow-link').then(({ followMarkdownLink }) =>
      followMarkdownLink(href, tabId, (slug) => {
        void import('@/lib/markdown').then(({ headingLine }) => {
          const line = headingLine(view.state.doc.toString(), slug)
          if (!line) return
          const at = view.state.doc.line(line).from
          view.dispatch({ selection: EditorSelection.cursor(at), effects: EditorView.scrollIntoView(at, { y: 'start' }) })
        })
      })
    )
    return true
  }
})
