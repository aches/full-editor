/** Pure link resolution for markdown documents — shared by the preview and the editor. */

export type MarkdownLinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'heading'; slug: string }
  | { kind: 'file'; path: string; line?: number; slug?: string }

/** GitHub-style heading slug: lowercase, punctuation dropped, spaces → hyphens. */
export function slugifyHeading(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
}

/** Duplicate headings get -1, -2… suffixes, matching GitHub. */
export function uniqueSlug(text: string, seen: Map<string, number>): string {
  const base = slugifyHeading(text)
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/** Collapse `.` / `..` segments of an absolute POSIX path. */
export function normalizePath(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return '/' + out.join('/')
}

/**
 * Resolve a link href found in the markdown file at `fromPath`.
 * Fragments: `#L12` / `#L12-L20` jump to a line, anything else is a heading slug.
 */
export function resolveMarkdownLink(href: string, fromPath: string): MarkdownLinkTarget | null {
  let raw = href.trim()
  if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1).trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return { kind: 'external', url: raw }

  const hashAt = raw.indexOf('#')
  const fragment = hashAt === -1 ? '' : safeDecode(raw.slice(hashAt + 1))
  let pathPart = hashAt === -1 ? raw : raw.slice(0, hashAt)

  if (/^file:\/\//i.test(pathPart)) pathPart = pathPart.replace(/^file:\/\/[^/]*/i, '')
  else if (/^[a-z][a-z0-9+.-]*:/i.test(pathPart)) return null // mailto:, data:, javascript:…
  pathPart = safeDecode(pathPart.replace(/\?.*$/, ''))

  if (!pathPart) return fragment ? { kind: 'heading', slug: fragment } : null

  const fromDir = fromPath.slice(0, fromPath.lastIndexOf('/')) || '/'
  const path = normalizePath(pathPart.startsWith('/') ? pathPart : `${fromDir}/${pathPart}`)
  const lineMatch = /^L(\d+)(?:-L?\d+)?$/i.exec(fragment)
  if (lineMatch) return { kind: 'file', path, line: Number(lineMatch[1]) }
  return fragment ? { kind: 'file', path, slug: fragment } : { kind: 'file', path }
}
