import { app, dialog, type BrowserWindow } from 'electron'
import type { CloseRequest } from '@shared/types'

let window: BrowserWindow | null = null
let pending: CloseRequest | null = null
let nextId = 0
let exitApproved = false
let reloadApproved = false
let responseTimer: NodeJS.Timeout | null = null
let fallbackOpen = false

async function showUnresponsiveChoice(request: CloseRequest): Promise<void> {
  if (!window || window.isDestroyed() || pending?.id !== request.id || fallbackOpen) return
  fallbackOpen = true
  try {
    const result = await dialog.showMessageBox(window, {
      type: 'warning', title: 'Waiting for document protection',
      message: 'The editor has not finished protecting your documents.',
      detail: 'Keep waiting to allow saving and recovery backups to finish. Closing now may lose changes made since the last successful recovery backup.',
      buttons: ['Cancel', 'Keep Waiting', request.reason === 'reload' ? 'Reload Anyway' : 'Close Anyway'],
      defaultId: 0, cancelId: 0, noLink: true
    })
    if (pending?.id !== request.id) return
    if (result.response === 1) {
      responseTimer = setTimeout(() => void showUnresponsiveChoice(request), 30000)
    } else {
      respondClose(request.id, result.response === 2)
    }
  } catch (error) {
    // A destroyed window can cancel its native dialog; never approve implicitly.
    console.error('Could not display document protection prompt', error)
    if (pending?.id === request.id) respondClose(request.id, false)
  } finally {
    fallbackOpen = false
  }
}

export function requestClose(reason: CloseRequest['reason']): void {
  if (!window || window.isDestroyed() || exitApproved) return
  if (pending) {
    if (reason === 'quit') pending.reason = 'quit'
    return
  }
  pending = { id: ++nextId, reason }
  window.webContents.send('evt:requestClose', pending)
  const request = pending
  responseTimer = setTimeout(() => void showUnresponsiveChoice(request), 30000)
}

export function respondClose(id: number, allow: boolean): boolean {
  if (!pending || pending.id !== id || typeof allow !== 'boolean') return false
  const request = pending
  pending = null
  if (responseTimer) clearTimeout(responseTimer)
  responseTimer = null
  if (!allow || !window || window.isDestroyed()) return true
  if (request.reason === 'reload') {
    reloadApproved = true
    window.webContents.reload()
    return true
  }
  exitApproved = true
  if (request.reason === 'quit') app.quit()
  else window.close()
  return true
}

/** All normal destructive lifecycle paths require one renderer acknowledgement. */
export function installLifecycleGuard(win: BrowserWindow): void {
  window = win
  win.webContents.on('will-prevent-unload', (event) => {
    // Only a matching renderer acknowledgement or explicit "Anyway" choice
    // can override a renderer that still tries to prevent unloading.
    if (exitApproved || reloadApproved) event.preventDefault()
  })
  win.webContents.on('did-finish-load', () => { reloadApproved = false })
  win.on('close', (event) => {
    if (exitApproved) return
    event.preventDefault()
    requestClose('close')
  })
  win.on('closed', () => {
    window = null
    if (responseTimer) clearTimeout(responseTimer)
    responseTimer = null
    pending = null
  })
  win.on('unresponsive', () => {
    if (pending) void showUnresponsiveChoice(pending)
  })
  win.webContents.on('render-process-gone', () => {
    if (pending) void showUnresponsiveChoice(pending)
  })
}

app.on('before-quit', (event) => {
  if (exitApproved || !window || window.isDestroyed()) return
  event.preventDefault()
  requestClose('quit')
})
