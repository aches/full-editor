import { useMemo, useState } from 'react'
import type { DirEntry, ProjectRoot } from '@shared/types'
import { useStore } from '@/stores'
import { basename } from '@/lib/paths'
import { TreeRow, TreeStatusRow } from './TreeRow'
import ContextMenu, { type ContextMenuItem } from './ContextMenu'

interface MenuState {
  x: number
  y: number
  entry: DirEntry
  rootId?: string
}

function menuItemsFor(entry: DirEntry, isRoot: boolean): ContextMenuItem[] {
  const isDir = entry.kind === 'dir' || entry.kind === 'symlink-dir'
  const items: ContextMenuItem[] = []
  if (isDir) {
    items.push({ key: 'new-file', label: 'New File…' })
    items.push({ key: 'new-dir', label: 'New Folder…' })
  }
  if (!isRoot) {
    items.push({ key: 'rename', label: 'Rename…', separatorBefore: isDir })
    items.push({ key: 'trash', label: 'Move to Trash', danger: true })
  }
  items.push({ key: 'reveal', label: 'Reveal in Finder', separatorBefore: true })
  if (isRoot) {
    items.push({ key: 'remove-root', label: 'Remove from Project', danger: true, separatorBefore: true })
  }
  return items
}

export type TreeRowData =
  | { kind: 'entry'; entry: DirEntry; depth: number; rootId?: string }
  | { kind: 'loading'; key: string; depth: number }
  | { kind: 'error'; key: string; depth: number; message: string; dirPath: string }

function flatten(
  roots: ProjectRoot[],
  expanded: Record<string, true>,
  childrenByDir: Record<string, DirEntry[]>,
  loadingDirs: Record<string, true>,
  errorByDir: Record<string, string>
): TreeRowData[] {
  const rows: TreeRowData[] = []

  const visit = (entry: DirEntry, depth: number, ancestors: Set<string>, rootId?: string): void => {
    rows.push({ kind: 'entry', entry, depth, rootId })
    const isDir = entry.kind === 'dir' || entry.kind === 'symlink-dir'
    if (!isDir || !expanded[entry.path]) return
    if (ancestors.has(entry.path)) return // symlink loop guard
    const nextAncestors = new Set(ancestors).add(entry.path)
    if (errorByDir[entry.path]) {
      rows.push({
        kind: 'error',
        key: `err:${entry.path}`,
        depth: depth + 1,
        message: errorByDir[entry.path],
        dirPath: entry.path
      })
      return
    }
    const children = childrenByDir[entry.path]
    if (!children) {
      if (loadingDirs[entry.path]) rows.push({ kind: 'loading', key: `load:${entry.path}`, depth: depth + 1 })
      return
    }
    for (const child of children) visit(child, depth + 1, nextAncestors)
  }

  for (const root of roots) {
    visit({ name: basename(root.path), path: root.path, kind: 'dir', size: 0 }, 0, new Set(), root.id)
  }
  return rows
}

export default function FileTree({ roots }: { roots: ProjectRoot[] }): React.ReactElement {
  const expanded = useStore((s) => s.expanded)
  const childrenByDir = useStore((s) => s.childrenByDir)
  const loadingDirs = useStore((s) => s.loadingDirs)
  const errorByDir = useStore((s) => s.errorByDir)
  const selectedPath = useStore((s) => s.selectedPath)
  const [menu, setMenu] = useState<MenuState | null>(null)

  const rows = useMemo(
    () => flatten(roots, expanded, childrenByDir, loadingDirs, errorByDir),
    [roots, expanded, childrenByDir, loadingDirs, errorByDir]
  )

  const onMenuAction = (key: string): void => {
    if (!menu) return
    const store = useStore.getState()
    const { entry, rootId } = menu
    const isDir = entry.kind === 'dir' || entry.kind === 'symlink-dir'
    switch (key) {
      case 'new-file':
        store.setFsModal({ mode: 'new-file', targetPath: entry.path, initialName: '' })
        break
      case 'new-dir':
        store.setFsModal({ mode: 'new-dir', targetPath: entry.path, initialName: '' })
        break
      case 'rename':
        store.setFsModal({ mode: 'rename', targetPath: entry.path, initialName: entry.name })
        break
      case 'trash':
        store.setConfirmTrash({ path: entry.path, name: entry.name, isDir })
        break
      case 'reveal':
        store.revealEntry(entry.path)
        break
      case 'remove-root':
        if (rootId) void store.removeRoot(rootId)
        break
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const entryRows = rows.filter((r) => r.kind === 'entry')
    const idx = entryRows.findIndex((r) => r.kind === 'entry' && r.entry.path === selectedPath)
    const store = useStore.getState()
    const current = idx >= 0 ? (entryRows[idx] as Extract<TreeRowData, { kind: 'entry' }>) : null

    switch (e.key) {
      case 'ArrowDown': {
        const next = entryRows[Math.min(idx + 1, entryRows.length - 1)]
        if (next?.kind === 'entry') store.setSelectedPath(next.entry.path)
        e.preventDefault()
        break
      }
      case 'ArrowUp': {
        const prev = entryRows[Math.max(idx - 1, 0)]
        if (prev?.kind === 'entry') store.setSelectedPath(prev.entry.path)
        e.preventDefault()
        break
      }
      case 'ArrowRight': {
        if (current && (current.entry.kind === 'dir' || current.entry.kind === 'symlink-dir')) {
          if (!expanded[current.entry.path]) store.toggleDir(current.entry.path)
        }
        e.preventDefault()
        break
      }
      case 'ArrowLeft': {
        if (current && expanded[current.entry.path]) store.toggleDir(current.entry.path)
        e.preventDefault()
        break
      }
      case 'Enter': {
        if (!current) break
        const isDir = current.entry.kind === 'dir' || current.entry.kind === 'symlink-dir'
        if (isDir) store.toggleDir(current.entry.path)
        else void store.openFile(current.entry.path, current.entry.name)
        e.preventDefault()
        break
      }
    }
  }

  return (
    <div
      className="flex-1 overflow-y-auto py-1 outline-none"
      role="tree"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {rows.map((row) =>
        row.kind === 'entry' ? (
          <TreeRow
            key={row.entry.path}
            entry={row.entry}
            depth={row.depth}
            rootId={row.rootId}
            expanded={!!expanded[row.entry.path]}
            selected={selectedPath === row.entry.path}
            onContextMenu={(e) => {
              e.preventDefault()
              useStore.getState().setSelectedPath(row.entry.path)
              setMenu({ x: e.clientX, y: e.clientY, entry: row.entry, rootId: row.rootId })
            }}
          />
        ) : (
          <TreeStatusRow key={row.key} row={row} />
        )
      )}
      {menu && (
        <ContextMenu
          items={menuItemsFor(menu.entry, !!menu.rootId)}
          x={menu.x}
          y={menu.y}
          onAction={onMenuAction}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
