import { useEffect, useRef, useState } from 'react'
import { Button, Spinner, Tooltip, toast } from '@heroui/react'
import { CircleAlert, Download, RefreshCw } from 'lucide-react'
import type { UpdateState } from '@shared/types'

export default function UpdateButton(): React.ReactElement {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const previous = useRef<UpdateState['status']>('idle')

  useEffect(() => {
    void window.api.update.getState().then(setState)
    return window.api.events.onUpdateState(setState)
  }, [])

  useEffect(() => {
    const before = previous.current
    previous.current = state.status
    if (before === state.status) return
    if (state.status === 'up-to-date') toast('You’re up to date', { description: `Full Editor ${state.version} is the latest version.` })
    else if (state.status === 'ready') toast(`Update ${state.version} downloaded`, { description: 'Click the download button in the title bar to open the installer.' })
    else if (state.status === 'error') toast('Update failed', { description: state.message, variant: 'danger' })
    else if (state.status === 'downloading' && before !== 'downloading') toast(`Downloading update ${state.version}…`)
  }, [state])

  if (state.status === 'ready') {
    return (
      <Tooltip delay={300}>
        <Button
          aria-label={`Install update ${state.version}`}
          className="text-(--accent)"
          size="sm"
          variant="ghost"
          onPress={() => void window.api.update.openInstaller()}
        >
          <Download className="size-4" />
          <span className="text-xs">Install {state.version}</span>
        </Button>
        <Tooltip.Content>Open the downloaded installer, then quit and drag the app into Applications</Tooltip.Content>
      </Tooltip>
    )
  }

  const busy = state.status === 'checking' || state.status === 'downloading'
  const label =
    state.status === 'checking' ? 'Checking for updates…'
    : state.status === 'downloading' ? `Downloading ${state.version}${state.progress === null ? '' : ` (${Math.round(state.progress * 100)}%)`}`
    : state.status === 'error' ? `Update failed: ${state.message} Click to retry.`
    : 'Check for updates'

  return (
    <Tooltip delay={500}>
      <Button
        aria-label="Check for updates"
        isDisabled={busy}
        size="sm"
        variant="ghost"
        onPress={() => void window.api.update.check()}
      >
        {busy ? <Spinner size="sm" /> : state.status === 'error' ? <CircleAlert className="size-4 text-(--danger)" /> : <RefreshCw className="size-4" />}
        {state.status === 'downloading' && state.progress !== null && (
          <span className="data-mono text-xs">{Math.round(state.progress * 100)}%</span>
        )}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  )
}
