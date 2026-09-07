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

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source))
}
