import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { app, net, shell } from 'electron'
import type { UpdateState } from '@shared/types'
import { UPDATE_REPO, isNewerVersion, isTrustedReleaseUrl, pickInstallerAsset, type ReleaseAsset, type ReleaseInfo } from '@shared/update'
import { mainWindow } from '../window'
import { downloadToFile } from './download'

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const STARTUP_DELAY_MS = 8000
const stateFile = (): string => join(app.getPath('userData'), 'update-state.json')

let state: UpdateState = { status: 'idle' }
let readyPath: string | null = null
let busy = false

export function updateState(): UpdateState {
  return state
}

function setState(next: UpdateState): void {
  state = next
  const win = mainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('evt:updateState', next)
  if (next.status === 'downloading') win.setProgressBar(next.progress ?? 2)
  else win.setProgressBar(-1)
}

async function lastCheck(): Promise<number> {
  try {
    const parsed = JSON.parse(await fs.readFile(stateFile(), 'utf8')) as { lastCheck?: unknown }
    return typeof parsed.lastCheck === 'number' ? parsed.lastCheck : 0
  } catch {
    return 0
  }
}

async function recordCheck(): Promise<void> {
  try {
    await fs.writeFile(stateFile(), JSON.stringify({ lastCheck: Date.now() }))
  } catch {
    /* bookkeeping must never surface as an error */
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

async function downloadInstaller(version: string, asset: ReleaseAsset): Promise<void> {
  // Asset names come from the network; keep only the final path segment.
  const dest = join(app.getPath('downloads'), basename(asset.name))
  try {
    if (asset.size && (await fs.stat(dest)).size === asset.size) {
      readyPath = dest
      setState({ status: 'ready', version })
      return
    }
  } catch {
    /* not downloaded yet */
  }
  setState({ status: 'downloading', version, progress: 0 })
  await downloadToFile((url, init) => net.fetch(url, init), asset.browser_download_url, dest, {
    expectedSize: asset.size,
    signal: AbortSignal.timeout(30 * 60 * 1000),
    onProgress: (progress) => setState({ status: 'downloading', version, progress })
  })
  readyPath = dest
  setState({ status: 'ready', version })
}

/** Automatic checks stay quiet unless a download starts; manual ones also report "up to date" and failures. */
export async function checkForUpdates(manual: boolean): Promise<void> {
  if (busy) return
  if (state.status === 'ready' && readyPath) {
    if (manual) setState({ ...state })
    return
  }
  busy = true
  try {
    setState({ status: 'checking' })
    const release = await fetchLatestRelease()
    await recordCheck()
    const version = release.tag_name.replace(/^v/, '')
    if (!isNewerVersion(version, app.getVersion())) {
      setState(manual ? { status: 'up-to-date', version: app.getVersion() } : { status: 'idle' })
      return
    }
    const asset = pickInstallerAsset(release, process.arch)
    if (!asset) throw new Error(`Version ${version} has no installer for this Mac. Get it from the release page.`)
    await downloadInstaller(version, asset)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setState(manual || state.status === 'downloading' ? { status: 'error', message } : { status: 'idle' })
  } finally {
    busy = false
  }
}

export async function openDownloadedInstaller(): Promise<void> {
  if (!readyPath) return
  const error = await shell.openPath(readyPath)
  if (error) shell.showItemInFolder(readyPath)
}

export function scheduleStartupUpdateCheck(): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    void lastCheck().then((last) => {
      if (Date.now() - last >= CHECK_INTERVAL_MS) return checkForUpdates(false)
    })
  }, STARTUP_DELAY_MS).unref()
}
