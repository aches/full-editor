import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react'
import { ChevronRight, EllipsisVertical, RotateCw, TriangleAlert } from 'lucide-react'
import type { DirEntry } from '@shared/types'
import { useStore } from '@/stores'
import { prettyPath } from '@/lib/paths'
import { FileIcon } from './file-icon'
import type { TreeRowData } from './FileTree'

export function TreeRow({
  entry,
  depth,
  rootId,
  expanded,
  selected,
  onContextMenu
}: {
  entry: DirEntry
  depth: number
  rootId?: string
  expanded: boolean
  selected: boolean
  onContextMenu?: (e: React.MouseEvent) => void
}): React.ReactElement {
  const isDir = entry.kind === 'dir' || entry.kind === 'symlink-dir'

  const onActivate = (): void => {
    const store = useStore.getState()
    store.setSelectedPath(entry.path)
    if (isDir) store.toggleDir(entry.path)
    else void store.openFile(entry.path, entry.name)
  }

  return (
    <div
      className={`group flex h-[26px] cursor-default items-center gap-1.5 rounded-(--radius) pr-1 text-[13px] ${
        selected
          ? 'bg-(--accent-soft) text-(--foreground)'
          : 'text-(--foreground) hover:bg-(--background-tertiary)'
      }`}
      style={{ paddingLeft: depth * 14 + 6 }}
      role="treeitem"
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={selected}
      onClick={onActivate}
      onContextMenu={onContextMenu}
    >
      <span className="flex w-4 shrink-0 items-center justify-center">
        {isDir && (
          <ChevronRight
            className={`size-3.5 text-(--muted) transition-transform duration-100 ${expanded ? 'rotate-90' : ''}`}
          />
        )}
      </span>
      <FileIcon entry={entry} expanded={expanded} />
      <span className="truncate">{entry.name}</span>
      {rootId ? (
        <span className="ml-auto flex items-center gap-1 pl-2">
          <Tooltip delay={400}>
            <span className="data-mono hidden max-w-40 truncate text-(--muted) min-[0px]:group-hover:inline">
              {prettyPath(entry.path)}
            </span>
            <Tooltip.Content>{entry.path}</Tooltip.Content>
          </Tooltip>
          <span onClick={(e) => e.stopPropagation()}>
            <Dropdown>
              <Button
                isIconOnly
                aria-label="Root folder actions"
                className="size-5 min-w-5 opacity-0 group-hover:opacity-100"
                size="sm"
                variant="ghost"
              >
                <EllipsisVertical className="size-3.5" />
              </Button>
              <Dropdown.Popover>
                <Dropdown.Menu
                  onAction={(key) => {
                    if (key === 'remove') void useStore.getState().removeRoot(rootId)
                  }}
                >
                  <Dropdown.Item id="remove" textValue="Remove from project" variant="danger">
                    <Label>Remove from project</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </span>
        </span>
      ) : null}
    </div>
  )
}

export function TreeStatusRow({
  row
}: {
  row: Extract<TreeRowData, { kind: 'loading' | 'error' }>
}): React.ReactElement {
  if (row.kind === 'loading') {
    return (
      <div
        className="flex h-[26px] items-center gap-2 text-(--muted)"
        style={{ paddingLeft: row.depth * 14 + 26 }}
      >
        <Spinner size="sm" />
        <span className="text-xs">Loading…</span>
      </div>
    )
  }
  return (
    <div
      className="flex h-[26px] items-center gap-1.5 text-(--danger)"
      style={{ paddingLeft: row.depth * 14 + 26 }}
    >
      <TriangleAlert className="size-3.5 shrink-0" />
      <span className="truncate text-xs" title={row.message}>
        Cannot read folder
      </span>
      <Button
        isIconOnly
        aria-label="Retry"
        className="size-5 min-w-5"
        size="sm"
        variant="ghost"
        onPress={() => void useStore.getState().loadDir(row.dirPath)}
      >
        <RotateCw className="size-3" />
      </Button>
    </div>
  )
}
