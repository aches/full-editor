import { loadFileGrants } from './services/file-grants'
import { app, nativeTheme } from 'electron'
import { registerFileProtocolHandler, registerFileSchemeAsPrivileged } from './services/file-protocol'
import { flushProjectsSync, loadProjects } from './services/project-store'
import { stopWatching } from './services/watcher'
import { registerIpcHandlers } from './ipc/register'
import { installAppMenu } from './menu'
import { focusMainWindow, markdownPathsFromArgv, markOpenFilesReady, requestOpenPath } from './services/open-files'
import { scheduleStartupUpdateCheck } from './services/updater'
import { createMainWindow, mainWindow } from './window'
import { flushWindowStateSync, loadWindowState } from './window-state'

registerFileSchemeAsPrivileged()

// Dev-only: expose CDP so tooling can drive/inspect the renderer.
if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

// macOS delivers Finder/Dock opens here, possibly before `ready`.
app.on('open-file', (event, path) => {
  event.preventDefault()
  requestOpenPath(path)
})

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    for (const path of markdownPathsFromArgv(argv.slice(1), workingDirectory)) requestOpenPath(path)
    focusMainWindow()
  })
  for (const path of markdownPathsFromArgv(process.argv.slice(1), process.cwd())) requestOpenPath(path)
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  await Promise.all([loadWindowState(), loadProjects(), loadFileGrants()])
  registerFileProtocolHandler()
  registerIpcHandlers()
  installAppMenu()
  await markOpenFilesReady()
  createMainWindow()
  scheduleStartupUpdateCheck()

  nativeTheme.on('updated', () => {
    mainWindow()?.webContents.send('evt:systemThemeChanged', nativeTheme.shouldUseDarkColors)
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  try {
    stopWatching()
    flushProjectsSync()
    flushWindowStateSync()
  } catch {
    /* never block quit on a failed flush */
  }
})
