import { requestClose } from './lifecycle'
import { Menu, type MenuItemConstructorOptions } from 'electron'
import { checkForUpdates } from './services/updater'
import { isMiniMode, mainWindow, setMiniMode } from './window'

/**
 * A real menu is required on macOS for Cmd+C/V/X to work at all.
 * `Cmd+W` is repurposed from "close window" to "close tab", and `Cmd+S`
 * routes to the renderer's save action.
 */
export function installAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Full Editor',
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => void checkForUpdates(true) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow()?.webContents.send('evt:saveActiveTab')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow()?.webContents.send('evt:saveAsActiveTab')
        },
        {
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => mainWindow()?.webContents.send('evt:saveAllTabs')
        },
        {
          label: 'Export',
          submenu: [
            { label: 'PNG Image…', click: () => mainWindow()?.webContents.send('evt:exportActiveTab', 'png') },
            { label: 'PDF Document…', click: () => mainWindow()?.webContents.send('evt:exportActiveTab', 'pdf') }
          ]
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow()?.webContents.send('evt:closeActiveTab')
        },
        { type: 'separator' },
        {
          label: 'Quick Open…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow()?.webContents.send('evt:openQuickOpen')
        },
        {
          label: 'Find in Project',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow()?.webContents.send('evt:openSearch')
        }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Mini Mode',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            void setMiniMode(!isMiniMode())
          }
        },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => requestClose('reload') },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
