import { Menu, type MenuItemConstructorOptions } from 'electron'
import { isMiniMode, mainWindow, setMiniMode } from './window'

/**
 * A real menu is required on macOS for Cmd+C/V/X to work at all.
 * `Cmd+W` is repurposed from "close window" to "close tab", and `Cmd+S`
 * routes to the renderer's save action.
 */
export function installAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow()?.webContents.send('evt:saveActiveTab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow()?.webContents.send('evt:closeActiveTab')
        },
        { type: 'separator' },
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
        { role: 'reload' },
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
