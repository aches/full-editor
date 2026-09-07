import { join } from 'node:path'
import { app, screen, type Rectangle } from 'electron'
import type { ThemePref } from '@shared/types'
import { MIN_OPACITY } from '@shared/types'
import { JsonStore } from './services/json-store'

interface WindowStateFile {
  version: number
  normalBounds: Rectangle | null
  opacity: number
  pinned: boolean
  themePref: ThemePref
  palette: string
}

let store: JsonStore<WindowStateFile> | null = null

function ensure(): JsonStore<WindowStateFile> {
  if (!store) {
    store = new JsonStore<WindowStateFile>(join(app.getPath('userData'), 'window-state.json'), () => ({
      version: 1,
      normalBounds: null,
      opacity: 1,
      pinned: false,
      themePref: 'system',
      palette: 'auto'
    }))
  }
  return store
}

export async function loadWindowState(): Promise<void> {
  await ensure().load()
  const d = ensure().data
  ensure().update((s) => {
    s.opacity = clampOpacity(d.opacity)
  })
}

export function flushWindowStateSync(): void {
  store?.flushSync()
}

export function windowState(): WindowStateFile {
  return ensure().data
}

export function updateWindowState(mutator: (s: WindowStateFile) => void): void {
  ensure().update(mutator)
}

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(MIN_OPACITY, value))
}

/** Keep saved bounds usable when the display they were on is gone. */
export function clampToDisplay(bounds: Rectangle | null, fallback: { width: number; height: number }): Rectangle {
  const primary = screen.getPrimaryDisplay().workArea
  if (!bounds) {
    return {
      width: fallback.width,
      height: fallback.height,
      x: primary.x + Math.max(0, Math.round((primary.width - fallback.width) / 2)),
      y: primary.y + Math.max(0, Math.round((primary.height - fallback.height) / 2))
    }
  }
  const onSomeDisplay = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    const overlapX = Math.min(bounds.x + bounds.width, a.x + a.width) - Math.max(bounds.x, a.x)
    const overlapY = Math.min(bounds.y + bounds.height, a.y + a.height) - Math.max(bounds.y, a.y)
    return overlapX > 100 && overlapY > 100
  })
  if (onSomeDisplay) return bounds
  return clampToDisplay(null, { width: bounds.width, height: bounds.height })
}
