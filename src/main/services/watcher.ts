import { watch, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { FsChangedPayload } from '@shared/types'
import { invalidateFileIndex } from './file-index'

const FLUSH_MS = 300
const MAX_BATCH = 200

let watchers: FSWatcher[] = []
let targetWin: BrowserWindow | null = null
let pendingDirs = new Set<string>()
let pendingFiles = new Set<string>()
let flushTimer: NodeJS.Timeout | null = null

function flush(): void {
  flushTimer = null
  invalidateFileIndex()
  if (!targetWin || targetWin.isDestroyed()) return
  if (pendingDirs.size === 0 && pendingFiles.size === 0) return
  const payload: FsChangedPayload = {
    dirs: [...pendingDirs].slice(0, MAX_BATCH),
    files: [...pendingFiles].slice(0, MAX_BATCH)
  }
  pendingDirs = new Set()
  pendingFiles = new Set()
  targetWin.webContents.send('evt:fsChanged', payload)
}

function scheduleFlush(): void {
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS)
}

/** Replace the watched root set. macOS fs.watch is FSEvents-backed, recursion is cheap. */
export function setWatchRoots(paths: string[], win: BrowserWindow): void {
  targetWin = win
  for (const w of watchers) w.close()
  watchers = []
  pendingDirs = new Set()
  pendingFiles = new Set()
  for (const root of paths) {
    try {
      const w = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const abs = join(root, filename.toString())
        pendingFiles.add(abs)
        pendingDirs.add(dirname(abs))
        scheduleFlush()
      })
      w.on('error', () => w.close())
      watchers.push(w)
    } catch {
      // Root vanished or is unreadable — the tree shows its own error state.
    }
  }
}

export function stopWatching(): void {
  for (const w of watchers) w.close()
  watchers = []
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
}
