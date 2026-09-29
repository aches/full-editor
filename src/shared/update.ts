export const UPDATE_REPO = 'aches/full-editor'

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface ReleaseInfo {
  tag_name: string
  html_url: string
  body?: string | null
  assets?: ReleaseAsset[]
}

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn'] as const

/** Numeric core plus optional pre-release tag; anything else is not a version. */
function parseVersion(input: string): { core: number[]; pre: string | null } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(input.trim())
  if (!match) return null
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null }
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i]! > b.core[i]!
  }
  if (a.pre === b.pre) return false
  if (a.pre === null) return true
  if (b.pre === null) return false
  return a.pre.localeCompare(b.pre, undefined, { numeric: true }) > 0
}

/** Prefer the installer for this CPU, then any installer, else send the user to the release page. */
export function pickDownloadUrl(release: ReleaseInfo, arch: string): string {
  const assets = release.assets ?? []
  const byExt = (ext: string): ReleaseAsset[] => assets.filter((a) => a.name.toLowerCase().endsWith(ext))
  const dmgs = byExt('.dmg')
  const asset = dmgs.find((a) => a.name.includes(arch)) ?? dmgs[0] ?? byExt('.zip').find((a) => a.name.includes(arch))
  return asset && isTrustedReleaseUrl(asset.browser_download_url) ? asset.browser_download_url : release.html_url
}

export function isTrustedReleaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' && parsed.pathname.startsWith(`/${UPDATE_REPO}/`)
  } catch {
    return false
  }
}

export function isMarkdownPath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot > 0 && path[dot - 1] !== '/' && (MARKDOWN_EXTENSIONS as readonly string[]).includes(path.slice(dot + 1).toLowerCase())
}
