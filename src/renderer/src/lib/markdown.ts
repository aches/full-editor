import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/**
 * Loaded lazily (dynamic import) the first time a markdown preview opens.
 * html is off in markdown-it AND the output still runs through DOMPurify.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false
})

const SOURCE_LINE = 'data-source-line'

/** Tag top-level blocks with their 1-based source line for the preview gutter. */
md.core.ruler.push('source_line', (state) => {
  for (const token of state.tokens) {
    if (!token.block || token.level !== 0 || !token.map || token.nesting === -1) continue
    // The default fence renderer puts attrs on <code>; it is handled below instead.
    if (token.type === 'fence') continue
    token.attrSet(SOURCE_LINE, String(token.map[0] + 1))
  }
})

const renderFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const html = renderFence(tokens, idx, options, env, self)
  if (token.level !== 0 || !token.map) return html
  return html.replace('<pre', `<pre ${SOURCE_LINE}="${token.map[0] + 1}"`)
}

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source))
}
