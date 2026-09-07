import { Button, Tooltip } from '@heroui/react'
import { FolderPlus, FolderTree, RotateCw, Search } from 'lucide-react'
import { useStore } from '@/stores'
import FileTree from '../tree/FileTree'
import SearchPanel from './SearchPanel'
import { NoProjectState, NoRootsState } from '../common/EmptyState'

function HeaderIcon({
  label,
  icon,
  onPress
}: {
  label: string
  icon: React.ReactNode
  onPress: () => void
}): React.ReactElement {
  return (
    <Tooltip delay={500}>
      <Button isIconOnly aria-label={label} size="sm" variant="ghost" onPress={onPress}>
        {icon}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  )
}

export default function Sidebar(): React.ReactElement {
  const width = useStore((s) => s.sidebarWidth)
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const mode = useStore((s) => s.sidebarMode)
  const active = projects.find((p) => p.id === activeProjectId)

  return (
    <aside className="flex shrink-0 flex-col border-r border-(--separator)" style={{ width }}>
      <div className="flex h-9 shrink-0 items-center justify-between pr-1.5 pl-3">
        <span className="section-label">{mode === 'files' ? 'Explorer' : 'Search'}</span>
        {active && (
          <span className="flex items-center">
            {mode === 'files' ? (
              <>
                <HeaderIcon
                  icon={<Search className="size-4" />}
                  label="Find in project (⌘⇧F)"
                  onPress={() => useStore.getState().focusSearch()}
                />
                <HeaderIcon
                  icon={<FolderPlus className="size-4" />}
                  label="Add folder to project"
                  onPress={() => void useStore.getState().addRootsToActive()}
                />
                <HeaderIcon
                  icon={<RotateCw className="size-4" />}
                  label="Refresh"
                  onPress={() => void useStore.getState().refreshTree()}
                />
              </>
            ) : (
              <HeaderIcon
                icon={<FolderTree className="size-4" />}
                label="Back to files"
                onPress={() => useStore.getState().setSidebarMode('files')}
              />
            )}
          </span>
        )}
      </div>
      {!active ? (
        <NoProjectState />
      ) : mode === 'search' ? (
        <SearchPanel />
      ) : active.roots.length === 0 ? (
        <NoRootsState />
      ) : (
        <FileTree roots={active.roots} />
      )}
    </aside>
  )
}
