import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { app } from 'electron'
import type { ProjectSession, WriteResult } from '@shared/types'
import { atomicWrite, serializeWrite } from './atomic-write'

const languages = new Set(['markdown', 'yaml', 'json', 'javascript', 'typescript', 'jsx', 'tsx', 'html', 'css', 'python', 'xml', 'sql', 'shell', 'toml', 'dockerfile', 'properties', 'log', 'plain'])
const coordinate = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) >= 0

export function validateSession(value: unknown): asserts value is ProjectSession {
  const s = value as ProjectSession | null
  if (!s || s.version !== 1 || !Array.isArray(s.tabs) || s.tabs.length > 1000 ||
    !Array.isArray(s.expanded) || !s.expanded.every((p) => typeof p === 'string' && isAbsolute(p)) ||
    !(s.activeTabId === null || typeof s.activeTabId === 'string') ||
    !(s.selectedPath === null || typeof s.selectedPath === 'string' && isAbsolute(s.selectedPath)) ||
    !Number.isFinite(s.sidebarWidth) || s.sidebarWidth < 0) throw new Error('Invalid session metadata')
  const ids = new Set<string>()
  for (const t of s.tabs) {
    if (!t || typeof t.id !== 'string' || !t.id || ids.has(t.id) || typeof t.path !== 'string' || !isAbsolute(t.path) ||
      typeof t.name !== 'string' || !languages.has(t.language) || !t.cursor || !coordinate(t.cursor.anchor) || !coordinate(t.cursor.head) ||
      !Number.isFinite(t.scrollTop) || t.scrollTop < 0 || !Number.isFinite(t.scrollLeft) || t.scrollLeft < 0 ||
      !['edit', 'split', 'preview'].includes(t.mdView) || typeof t.svgPreview !== 'boolean') throw new Error('Invalid session tab')
    ids.add(t.id)
    if (t.draft && (typeof t.draft.content !== 'string' || typeof t.draft.savedContent !== 'string' ||
      !(t.draft.revision === null || typeof t.draft.revision === 'string' && /^[a-f0-9]{64}$/.test(t.draft.revision)))) throw new Error('Invalid recovery draft')
  }
  if (s.activeTabId !== null && !ids.has(s.activeTabId)) throw new Error('Session active tab is missing')
}

function sessionPath(projectId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId)) throw new Error('Invalid project ID')
  return join(app.getPath('userData'), 'sessions', `${projectId}.json`)
}

/** Load only validated data; damaged files remain available for manual recovery. */
async function readSession(file: string): Promise<ProjectSession | null> {
  let primaryMissing = false
  let primaryError: unknown
  try {
    const result: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    validateSession(result)
    return result
  } catch (error) {
    primaryMissing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    primaryError = error
  }
  try {
    const recovered: unknown = JSON.parse(await fs.readFile(`${file}.bak`, 'utf8'))
    validateSession(recovered)
    if (!primaryMissing) await fs.copyFile(file, `${file}.corrupt-${Date.now()}`)
    await atomicWrite(file, JSON.stringify(recovered))
    return recovered
  } catch (backupError) {
    if (primaryMissing && (backupError as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error(`Cannot restore session at ${file}. Recovery files have been preserved. ${String(primaryError)}; backup: ${String(backupError)}`)
  }
}

export function loadSession(projectId: string): Promise<ProjectSession | null> {
  const file = sessionPath(projectId)
  return serializeWrite(file, () => readSession(file))
}

export async function saveSession(projectId: string, session: ProjectSession): Promise<WriteResult> {
  try {
    validateSession(session)
    const file = sessionPath(projectId)
    const content = JSON.stringify(session)
    await serializeWrite(file, async () => {
      await fs.mkdir(join(app.getPath('userData'), 'sessions'), { recursive: true })
      const previous = await readSession(file)
      if (previous) await atomicWrite(`${file}.bak`, JSON.stringify(previous))
      await atomicWrite(file, content)
    })
    return { ok: true }
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'SESSION_SAVE_FAILED', message: e.message }
  }
}

export async function removeSession(projectId: string): Promise<WriteResult> {
  try {
    const file = sessionPath(projectId)
    await serializeWrite(file, async () => {
      // Remove backup first, so an interrupted deletion cannot resurrect it.
      await fs.rm(`${file}.bak`, { force: true })
      await fs.rm(file, { force: true })
      const directory = await fs.open(dirname(file), 'r').catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
        return null
      })
      if (directory) {
        try {
          await directory.sync()
        } finally {
          await directory.close()
        }
      }
    })
    return { ok: true }
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'SESSION_REMOVE_FAILED', message: e.message }
  }
}
