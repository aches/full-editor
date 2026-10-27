import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import type { Token } from 'markdown-it'
import { uniqueSlug } from './md-links'

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

const HEADING_SLUG = 'data-heading-slug'

function inlineText(inline: Token | undefined): string {
  if (!inline?.children) return inline?.content ?? ''
  return inline.children.map((t) => (t.type === 'text' || t.type === 'code_inline' ? t.content : '')).join('')
}

/** Tag every heading with its GitHub-style slug so `#fragment` links can find it. */
md.core.ruler.push('heading_slug', (state) => {
  const seen = new Map<string, number>()
  state.tokens.forEach((token, i) => {
    if (token.type === 'heading_open') token.attrSet(HEADING_SLUG, uniqueSlug(inlineText(state.tokens[i + 1]), seen))
  })
})

/** 1-based source line of the heading with this slug, or null. */
export function headingLine(source: string, slug: string): number | null {
  const wanted = slug.toLowerCase()
  for (const token of md.parse(source, {})) {
    if (token.type === 'heading_open' && token.map && token.attrGet(HEADING_SLUG) === wanted) return token.map[0] + 1
  }
  return null
}

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source))
}
