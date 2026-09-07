/** Display-oriented path helpers — no node:path in the sandboxed renderer. */

export function basename(p: string): string {
  const cleaned = p.replace(/\/+$/, '')
  const idx = cleaned.lastIndexOf('/')
  return idx === -1 ? cleaned : cleaned.slice(idx + 1)
}

export function dirname(p: string): string {
  const cleaned = p.replace(/\/+$/, '')
  const idx = cleaned.lastIndexOf('/')
  return idx <= 0 ? '/' : cleaned.slice(0, idx)
}

/** Shorten a home-anchored path for display: /Users/a/x → ~/x */
export function prettyPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}
