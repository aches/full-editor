import { promises as fsp } from 'node:fs'
import { basename, join } from 'node:path'
import type { QuickOpenEntry, QuickOpenResponse } from '@shared/types'
import { isPathAllowed } from './fs-service'
import { SKIP_DIRS } from './search'

const MAX_INDEX_FILES = 50000
const MAX_RESULTS = 50
const INDEX_TTL_MS = 60_000

interface IndexedFile {
  path: string
  name: string
  nameLower: string
  dir: string
  dirLower: string
}

interface IndexCache {
  key: string
  files: IndexedFile[]
  truncated: boolean
  builtAt: number
}

let cache: IndexCache | null = null

/** Called by the watcher whenever anything on disk changes. */
export function invalidateFileIndex(): void {
  cache = null
}

async function buildIndex(roots: string[]): Promise<IndexCache> {
  const files: IndexedFile[] = []
  let truncated = false

  async function walk(dir: string, display: string): Promise<void> {
    if (files.length >= MAX_INDEX_FILES) {
      truncated = true
      return
    }
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const subdirs: Array<[string, string]> = []
    for (const e of entries) {
      if (files.length >= MAX_INDEX_FILES) {
        truncated = true
        return
      }
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
          subdirs.push([join(dir, e.name), `${display}/${e.name}`])
        }
      } else if (e.isFile()) {
        const name = e.name
        files.push({
          path: join(dir, name),
          name,
          nameLower: name.toLowerCase(),
          dir: display,
          dirLower: display.toLowerCase()
        })
      }
    }
    for (const [sub, disp] of subdirs) await walk(sub, disp)
  }

  for (const root of roots) {
    await walk(root, basename(root))
  }
  return { key: roots.join('\n'), files, truncated, builtAt: Date.now() }
}

/** Subsequence match; returns the position span or null when not a match. */
function subsequenceSpan(hay: string, needle: string): number | null {
  let hi = hay.indexOf(needle[0])
  if (hi === -1) return null
  const first = hi
  for (let ni = 1; ni < needle.length; ni++) {
    hi = hay.indexOf(needle[ni], hi + 1)
    if (hi === -1) return null
  }
  return hi - first
}

function scoreFile(f: IndexedFile, q: string): number | null {
  const nameIdx = f.nameLower.indexOf(q)
  if (nameIdx !== -1) {
    // Earlier + tighter name hits first; prefix matches float to the top.
    return 10000 - nameIdx * 20 - f.nameLower.length
  }
  const nameSpan = subsequenceSpan(f.nameLower, q)
  if (nameSpan !== null) {
    return 5000 - nameSpan * 10 - f.nameLower.length
  }
  const dirIdx = f.dirLower.indexOf(q)
  if (dirIdx !== -1) {
    return 2000 - dirIdx - f.dirLower.length
  }
  const full = `${f.dirLower}/${f.nameLower}`
  const fullSpan = subsequenceSpan(full, q)
  if (fullSpan !== null) {
    return 500 - Math.min(499, fullSpan)
  }
  return null
}

export async function quickOpenSearch(roots: string[], query: string): Promise<QuickOpenResponse> {
  const allowed: string[] = []
  for (const r of roots) {
    if (await isPathAllowed(r)) allowed.push(r)
  }
  const key = allowed.join('\n')
  if (!cache || cache.key !== key || Date.now() - cache.builtAt > INDEX_TTL_MS) {
    cache = await buildIndex(allowed)
  }

  const q = query.trim().toLowerCase()
  if (!q) {
    return { entries: [], indexSize: cache.files.length, truncated: cache.truncated }
  }

  const scored: Array<{ score: number; f: IndexedFile }> = []
  for (const f of cache.files) {
    const score = scoreFile(f, q)
    if (score !== null) scored.push({ score, f })
  }
  scored.sort((a, b) => b.score - a.score || a.f.nameLower.localeCompare(b.f.nameLower))

  const entries: QuickOpenEntry[] = scored
    .slice(0, MAX_RESULTS)
    .map(({ f }) => ({ path: f.path, name: f.name, dir: f.dir }))
  return { entries, indexSize: cache.files.length, truncated: cache.truncated }
}
