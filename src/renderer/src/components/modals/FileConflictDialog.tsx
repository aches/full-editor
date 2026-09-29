import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '@heroui/react'
import { useStore } from '@/stores'
import { currentDoc, subscribeDocChanges } from '@/editor/doc-registry'
import { prettyPath } from '@/lib/paths'

// Bound the rendered comparison even for documents containing many short lines.
const MAX_COMPARISON_LINES = 2000
const MAX_LINE_LENGTH = 1000

function ComparisonPanel({
  title,
  lines,
  otherLines
}: {
  title: string
  lines: string[]
  otherLines: string[]
}): React.ReactElement {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-(--separator)">
      <h3 className="border-b border-(--separator) px-3 py-2 text-xs font-medium">{title}</h3>
      <div
        aria-label={title}
        className="data-mono h-[min(38vh,360px)] overflow-auto py-2 text-xs select-text"
        role="region"
        tabIndex={0}
      >
        {lines.slice(0, MAX_COMPARISON_LINES).map((line, index) => (
          <div
            key={index}
            className={`flex min-w-full w-max ${line !== otherLines[index] ? 'bg-warning/15' : ''}`}
          >
            <span aria-hidden="true" className="w-12 shrink-0 pr-3 text-right text-(--muted) select-none">
              {index + 1}
            </span>
            <span className="whitespace-pre pr-3">
              {line.slice(0, MAX_LINE_LENGTH) || ' '}
              {line.length > MAX_LINE_LENGTH && ' … [line truncated]'}
            </span>
          </div>
        ))}
        {lines.length > MAX_COMPARISON_LINES && (
          <p className="px-3 py-2 text-(--muted)">
            {lines.length - MAX_COMPARISON_LINES} more lines are not shown.
          </p>
        )}
      </div>
    </section>
  )
}

export default function FileConflictDialog(): React.ReactElement | null {
  const conflictTabId = useStore((s) => s.conflictTabId)
  const tab = useStore((s) => s.tabs.find((item) => item.id === s.conflictTabId))
  const [localContent, setLocalContent] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    if (!conflictTabId) return
    setLocalContent(currentDoc(conflictTabId))
    return subscribeDocChanges((changedTabId) => {
      if (changedTabId === conflictTabId) setLocalContent(currentDoc(conflictTabId))
    })
  }, [conflictTabId])

  useEffect(() => {
    if (conflictTabId && (!tab || !tab.conflict)) useStore.getState().setConflictTab(null)
  }, [conflictTabId, tab])

  const localLines = useMemo(() => localContent.split('\n'), [localContent])
  const diskLines = useMemo(() => (tab?.conflict?.diskContent ?? '').split('\n'), [tab?.conflict?.diskContent])

  if (!tab?.conflict || !conflictTabId) return null
  const conflict = tab.conflict
  const busy = pending || !!tab.saving
  const canCompare = conflict.type === 'changed' && conflict.diskContent !== undefined

  const resolve = async (action: 'reload' | 'overwrite' | 'save-as'): Promise<void> => {
    setPending(true)
    setError(null)
    try {
      const resolved = await useStore.getState().resolveDiskConflict(tab.id, action)
      if (resolved && useStore.getState().conflictTabId === tab.id) {
        useStore.getState().setConflictTab(null)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The action failed. Your local edits are still open.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) useStore.getState().setConflictTab(null)
      }}
    >
      <Modal.Backdrop isDismissable={!busy} isKeyboardDismissDisabled={busy}>
        <Modal.Container scroll="inside" size="lg">
          <Modal.Dialog className="sm:max-w-[960px]">
            <Modal.Header>
              <Modal.Heading>
                {conflict.type === 'changed' ? 'File changed on disk' : conflict.type === 'missing' ? 'File no longer exists' : 'File cannot be read'}
              </Modal.Heading>
              <p className="data-mono break-all text-xs text-(--muted)">{prettyPath(tab.path)}</p>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm">
                {conflict.type === 'changed'
                  ? 'Your local edits are still open. Compare both versions before choosing which content to keep.'
                  : conflict.type === 'missing'
                    ? 'Your local edits are still open. Save them to another location or recreate the file at its original path.'
                    : 'Your local edits are still open. Save a copy to another location while the original file is unavailable.'}
              </p>
              {conflict.message && <p className="mt-2 text-xs text-(--muted)">{conflict.message}</p>}
              {canCompare && (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-(--muted)">
                    Read-only comparison. Highlighted rows differ at the same line number; inserted lines may shift later rows.
                    Each panel shows up to 2,000 lines and 1,000 characters per line.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <ComparisonPanel lines={localLines} otherLines={diskLines} title="Local edits · unsaved" />
                    <ComparisonPanel lines={diskLines} otherLines={localLines} title="Current file on disk" />
                  </div>
                </div>
              )}
              {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            </Modal.Body>
            <Modal.Footer className="flex-wrap">
              <Button isDisabled={busy} variant="tertiary" onPress={() => useStore.getState().setConflictTab(null)}>
                Cancel
              </Button>
              <Button isDisabled={busy} variant="secondary" onPress={() => void resolve('save-as')}>
                Save As…
              </Button>
              {canCompare && (
                <Button isDisabled={busy} variant="danger" onPress={() => void resolve('reload')}>
                  Discard Local Edits & Reload
                </Button>
              )}
              {conflict.type === 'changed' && conflict.diskRevision && (
                <Button isDisabled={busy} variant="danger" onPress={() => void resolve('overwrite')}>
                  Overwrite Disk with Local Edits
                </Button>
              )}
              {conflict.type === 'missing' && (
                <Button isDisabled={busy} variant="primary" onPress={() => void resolve('overwrite')}>
                  Recreate File
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
