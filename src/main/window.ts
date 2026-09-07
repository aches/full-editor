import { join } from 'node:path'
import { BrowserWindow, nativeTheme, screen, type Rectangle } from 'electron'
import type { MiniModeResult, WindowStateSnapshot } from '@shared/types'
import { clampOpacity, clampToDisplay, updateWindowState, windowState } from './window-state'

const NORMAL_MIN = { width: 720, height: 480 }
const MINI_SIZE = { width: 420, height: 300 }
const MINI_MIN = { width: 320, height: 200 }

interface WinCtx {
  win: BrowserWindow
  miniMode: boolean
  normalBounds: Rectangle | null
  prevPinned: boolean
  miniBounds: Rectangle | null
  transitioning: boolean
}

let ctx: WinCtx | null = null

function resolvedDark(): boolean {
  const pref = windowState().themePref
  if (pref === 'system') return nativeTheme.shouldUseDarkColors
  return pref === 'dark'
}

export function backgroundColorForTheme(): string {
  return resolvedDark() ? '#1a1a1d' : '#f6f5f2'
}

export function createMainWindow(): BrowserWindow {
  const state = windowState()
  const bounds = clampToDisplay(state.normalBounds, { width: 1200, height: 800 })

  const win = new BrowserWindow({
    ...bounds,
    minWidth: NORMAL_MIN.width,
    minHeight: NORMAL_MIN.height,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: backgroundColorForTheme(),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  ctx = { win, miniMode: false, normalBounds: null, prevPinned: false, miniBounds: null, transitioning: false }

  win.once('ready-to-show', () => {
    win.setOpacity(clampOpacity(state.opacity))
    if (state.pinned) win.setAlwaysOnTop(true, 'floating')
    win.show()
  })

  const rememberBounds = (): void => {
    if (!ctx || ctx.miniMode || ctx.transitioning || win.isFullScreen()) return
    updateWindowState((s) => {
      s.normalBounds = win.getBounds()
    })
  }
  win.on('moved', () => {
    rememberBounds()
    if (ctx?.miniMode) ctx.miniBounds = win.getBounds()
  })
  win.on('resized', () => {
    rememberBounds()
    if (ctx?.miniMode) ctx.miniBounds = win.getBounds()
  })

  win.on('leave-full-screen', () => {
    // macOS occasionally re-shows traffic lights after leaving fullscreen.
    if (ctx?.miniMode) win.setWindowButtonVisibility(false)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}

export function mainWindow(): BrowserWindow | null {
  return ctx?.win ?? null
}

export function isMiniMode(): boolean {
  return ctx?.miniMode ?? false
}

export function setOpacity(value: number): number {
  const v = clampOpacity(value)
  ctx?.win.setOpacity(v)
  updateWindowState((s) => {
    s.opacity = v
  })
  return v
}

export function setAlwaysOnTop(on: boolean): boolean {
  if (!ctx) return false
  if (ctx.miniMode) return true // mini mode always floats; pin is restored on exit
  ctx.win.setAlwaysOnTop(on, 'floating')
  updateWindowState((s) => {
    s.pinned = on
  })
  return ctx.win.isAlwaysOnTop()
}

function defaultMiniBounds(win: BrowserWindow): Rectangle {
  const b = win.getBounds()
  const display = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  const area = display.workArea
  return {
    width: MINI_SIZE.width,
    height: MINI_SIZE.height,
    x: area.x + area.width - MINI_SIZE.width - 16,
    y: area.y + 16
  }
}

export async function setMiniMode(on: boolean): Promise<MiniModeResult> {
  if (!ctx || ctx.transitioning || on === ctx.miniMode) return { miniMode: ctx?.miniMode ?? false }
  const { win } = ctx
  ctx.transitioning = true
  try {
    if (on) {
      if (win.isFullScreen()) {
        const left = new Promise<void>((res) => win.once('leave-full-screen', () => res()))
        win.setFullScreen(false)
        await left
      }
      ctx.normalBounds = win.getBounds()
      ctx.prevPinned = win.isAlwaysOnTop()
      win.setWindowButtonVisibility(false)
      win.setMinimumSize(MINI_MIN.width, MINI_MIN.height)
      win.setBounds(ctx.miniBounds ?? defaultMiniBounds(win), true)
      win.setAlwaysOnTop(true, 'floating')
      ctx.miniMode = true
    } else {
      win.setAlwaysOnTop(ctx.prevPinned, 'floating')
      win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height)
      win.setBounds(clampToDisplay(ctx.normalBounds, { width: 1200, height: 800 }), true)
      win.setWindowButtonVisibility(true)
      ctx.miniMode = false
    }
    win.webContents.send('evt:miniModeChanged', ctx.miniMode)
    return { miniMode: ctx.miniMode }
  } finally {
    ctx.transitioning = false
  }
}

export function stateSnapshot(): WindowStateSnapshot {
  const s = windowState()
  return {
    opacity: s.opacity,
    pinned: ctx?.miniMode ? ctx.prevPinned : (ctx?.win.isAlwaysOnTop() ?? s.pinned),
    miniMode: ctx?.miniMode ?? false,
    themePref: s.themePref,
    palette: s.palette,
    systemDark: nativeTheme.shouldUseDarkColors
  }
}
