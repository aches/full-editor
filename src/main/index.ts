import { app, nativeTheme } from 'electron'
import { registerFileProtocolHandler, registerFileSchemeAsPrivileged } from './services/file-protocol'
import { flushProjectsSync, loadProjects } from './services/project-store'
import { stopWatching } from './services/watcher'
import { registerIpcHandlers } from './ipc/register'
import { installAppMenu } from './menu'
import { createMainWindow, mainWindow } from './window'
import { flushWindowStateSync, loadWindowState } from './window-state'

registerFileSchemeAsPrivileged()

// Dev-only: expose CDP so tooling can drive/inspect the renderer.
if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

app.whenReady().then(async () => {
  await Promise.all([loadWindowState(), loadProjects()])
  registerFileProtocolHandler()
  registerIpcHandlers()
  installAppMenu()
  createMainWindow()

  nativeTheme.on('updated', () => {
    mainWindow()?.webContents.send('evt:systemThemeChanged', nativeTheme.shouldUseDarkColors)
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  try {
    stopWatching()
    flushProjectsSync()
    flushWindowStateSync()
  } catch {
    /* never block quit on a failed flush */
  }
})
