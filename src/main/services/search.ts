import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { SearchFileResult, SearchMatch, SearchRequest, SearchResponse } from '@shared/types'
import { isPathAllowed } from './fs-service'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  '.idea',
  '.vscode',
  'coverage'
])

const MAX_FILE_SIZE = 1.5 * 1024 * 1024
const MAX_TOTAL_MATCHES = 500
const MAX_FILES_WITH_MATCHES = 120
const MAX_MATCHES_PER_FILE = 50
const MAX_SCANNED_FILES = 20000
const PREVIEW_LEN = 200

let generation = 0

function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192)
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true
  return false
}

interface Matcher {
  findAll: (line: string) => Array<{ column: number }>
}

function buildMatcher(req: SearchRequest): Matcher | { error: string } {
  if (req.regex) {
    let re: RegExp
    try {
      re = new RegExp(req.query, req.caseSensitive ? 'g' : 'gi')
    } catch (e) {
      return { error: `Invalid regex: ${(e as Error).message}` }
    }
    return {
      findAll: (line) => {
        const out: Array<{ column: number }> = []
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(line)) !== null && out.length < 20) {
          out.push({ column: m.index })
          if (m.index === re.lastIndex) re.lastIndex++
        }
        return out
      }
    }
  }
  const needle = req.caseSensitive ? req.query : req.query.toLowerCase()
  return {
    findAll: (line) => {
      const hay = req.caseSensitive ? line : line.toLowerCase()
      const out: Array<{ column: number }> = []
      let idx = 0
      while ((idx = hay.indexOf(needle, idx)) !== -1 && out.length < 20) {
        out.push({ column: idx })
        idx += Math.max(needle.length, 1)
      }
      return out
    }
  }
}

function previewOf(line: string, column: number): string {
  const trimmedStart = Math.max(0, column - 60)
  const raw = line.slice(trimmedStart, trimmedStart + PREVIEW_LEN)
  return (trimmedStart > 0 ? '…' : '') + raw.trimEnd()
}

export async function runSearch(req: SearchRequest): Promise<SearchResponse> {
  const gen = ++generation
  const started = Date.now()
  const empty: SearchResponse = { files: [], totalMatches: 0, truncated: false, scannedFiles: 0, tookMs: 0 }
  if (!req.query) return empty

  const built = buildMatcher(req)
  if ('error' in built) return { ...empty, error: built.error }
  const matcher: Matcher = built

  const roots: string[] = []
  for (const r of req.roots) {
    if (await isPathAllowed(r)) roots.push(r)
  }

  const files: SearchFileResult[] = []
  let totalMatches = 0
  let scannedFiles = 0
  let truncated = false

  const cancelled = (): boolean => gen !== generation
  const limitHit = (): boolean =>
    totalMatches >= MAX_TOTAL_MATCHES || files.length >= MAX_FILES_WITH_MATCHES || scannedFiles >= MAX_SCANNED_FILES

  async function scanFile(path: string, name: string): Promise<void> {
    scannedFiles++
    let buf: Buffer
    try {
      const st = await fsp.stat(path)
      if (!st.isFile() || st.size === 0 || st.size > MAX_FILE_SIZE) return
      buf = await fsp.readFile(path)
    } catch {
      return
    }
    if (looksBinary(buf)) return
    const lines = buf.toString('utf8').split('\n')
    const matches: SearchMatch[] = []
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
      for (const hit of matcher.findAll(lines[i])) {
        matches.push({ line: i + 1, column: hit.column, preview: previewOf(lines[i], hit.column) })
        if (matches.length >= MAX_MATCHES_PER_FILE) break
      }
    }
    if (matches.length > 0) {
      files.push({ path, name, matches })
      totalMatches += matches.length
    }
  }

  async function walk(dir: string): Promise<void> {
    if (cancelled() || limitHit()) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const subdirs: string[] = []
    for (const e of entries) {
      if (cancelled() || limitHit()) {
        truncated = true
        return
      }
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) subdirs.push(full)
      } else if (e.isFile()) {
        await scanFile(full, e.name)
      }
    }
    for (const sub of subdirs) {
      if (cancelled() || limitHit()) {
        truncated = true
        return
      }
      await walk(sub)
    }
  }

  for (const root of roots) {
    await walk(root)
  }
  if (limitHit()) truncated = true

  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, totalMatches, truncated, scannedFiles, tookMs: Date.now() - started }
}
