import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, net, shell } from 'electron'
import { UPDATE_REPO, isNewerVersion, isTrustedReleaseUrl, pickDownloadUrl, type ReleaseInfo } from '@shared/update'
import { mainWindow } from '../window'

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 8000
const stateFile = (): string => join(app.getPath('userData'), 'update-state.json')

interface UpdateState {
  lastCheck: number
  skippedVersion: string | null
}

let checking = false

async function readState(): Promise<UpdateState> {
  try {
    const parsed = JSON.parse(await fs.readFile(stateFile(), 'utf8')) as Partial<UpdateState>
    return {
      lastCheck: typeof parsed.lastCheck === 'number' ? parsed.lastCheck : 0,
      skippedVersion: typeof parsed.skippedVersion === 'string' ? parsed.skippedVersion : null
    }
  } catch {
    return { lastCheck: 0, skippedVersion: null }
  }
}

async function writeState(patch: Partial<UpdateState>): Promise<void> {
  try {
    await fs.writeFile(stateFile(), JSON.stringify({ ...(await readState()), ...patch }))
  } catch {
    /* update bookkeeping must never surface as an error */
  }
}

async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${app.getName()}/${app.getVersion()}` },
    signal: AbortSignal.timeout(10000)
  })
  if (response.status === 404) throw new Error('No published release was found.')
  if (!response.ok) throw new Error(`GitHub responded with ${response.status}.`)
  const release = (await response.json()) as ReleaseInfo
  if (typeof release.tag_name !== 'string' || !isTrustedReleaseUrl(release.html_url)) throw new Error('Unexpected release response.')
  return release
}

function releaseNotes(release: ReleaseInfo): string {
  const body = (release.body ?? '').trim()
  return body.length > 800 ? `${body.slice(0, 800)}…` : body
}

async function offerUpdate(release: ReleaseInfo): Promise<void> {
  const version = release.tag_name.replace(/^v/, '')
  const options = {
    type: 'info' as const,
    title: 'Update available',
    message: `Full Editor ${version} is available`,
    detail: `You have ${app.getVersion()}.${releaseNotes(release) ? `\n\n${releaseNotes(release)}` : ''}`,
    buttons: ['Download', 'Later', 'Skip This Version'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }
  const win = mainWindow()
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  if (response === 0) await shell.openExternal(pickDownloadUrl(release, process.arch))
  else if (response === 2) await writeState({ skippedVersion: version })
}

/** `manual` checks report every outcome; automatic ones stay silent unless there is something to install. */
export async function checkForUpdates(manual: boolean): Promise<void> {
  if (checking) return
  checking = true
  try {
    const release = await fetchLatestRelease()
    await writeState({ lastCheck: Date.now() })
    const version = release.tag_name.replace(/^v/, '')
    if (!isNewerVersion(version, app.getVersion())) {
      if (manual) {
        await dialog.showMessageBox({ type: 'info', message: 'You’re up to date', detail: `Full Editor ${app.getVersion()} is the latest version.`, buttons: ['OK'] })
      }
      return
    }
    if (!manual && (await readState()).skippedVersion === version) return
    await offerUpdate(release)
  } catch (error) {
    if (manual) {
      await dialog.showMessageBox({
        type: 'warning', message: 'Could not check for updates',
        detail: error instanceof Error ? error.message : String(error), buttons: ['OK']
      })
    }
  } finally {
    checking = false
  }
}

export function scheduleStartupUpdateCheck(): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    void readState().then((state) => {
      if (Date.now() - state.lastCheck >= CHECK_INTERVAL_MS) return checkForUpdates(false)
    })
  }, STARTUP_DELAY_MS).unref()
}
