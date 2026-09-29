import { resolve } from 'node:path'
import type { BrowserWindow } from 'electron'
import { isMarkdownPath } from '@shared/update'
import { grantOpenedFile } from './fs-service'
import { mainWindow } from '../window'

const early: string[] = []
const pending: string[] = []
let servicesReady = false
let rendererListening = false

/** Paths handed to us by the OS (Finder, `open -a`, command line) before the stores are loaded must wait. */
export function requestOpenPath(path: string): void {
  if (servicesReady) void deliver(path)
  else early.push(path)
}

export function markdownPathsFromArgv(argv: string[], cwd: string): string[] {
  return argv.filter((arg) => !arg.startsWith('-') && isMarkdownPath(arg)).map((arg) => resolve(cwd, arg))
}

export async function markOpenFilesReady(): Promise<void> {
  servicesReady = true
  for (const path of early.splice(0)) await deliver(path)
}

export function attachOpenFilesWindow(win: BrowserWindow): void {
  win.webContents.on('did-start-loading', () => { rendererListening = false })
}

export function takePendingOpenFiles(): string[] {
  rendererListening = true
  return pending.splice(0)
}

export function focusMainWindow(): void {
  const win = mainWindow()
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

async function deliver(path: string): Promise<void> {
  const granted = await grantOpenedFile(path)
  if (!granted) return
  const win = mainWindow()
  if (rendererListening && win && !win.isDestroyed()) win.webContents.send('evt:openExternalFile', granted)
  else pending.push(granted)
  focusMainWindow()
}
