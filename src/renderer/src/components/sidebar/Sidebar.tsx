import { Button, Dropdown, Header, Label, Tooltip } from '@heroui/react'
import { CalendarPlus, FileText, FileType, FolderPlus, FolderTree, RotateCw, Search } from 'lucide-react'
import { useStore } from '@/stores'
import { prettyPath } from '@/lib/paths'
import FileTree from '../tree/FileTree'
import SearchPanel from './SearchPanel'
import { NoProjectState, NoRootsState } from '../common/EmptyState'

function todayName(ext: string): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}.${ext}`
}

/** One-click daily note: creates (or reopens) today's file in the selected folder. */
function QuickCreateMenu(): React.ReactElement {
  const targetDir = useStore((s) => s.quickCreateTargetDir())

  return (
    <Dropdown>
      <Tooltip delay={500}>
        <Button isIconOnly aria-label="New daily note" size="sm" variant="ghost">
          <CalendarPlus className="size-4" />
        </Button>
        <Tooltip.Content>New daily note</Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className="min-w-56">
        <Dropdown.Menu
          onAction={(key) => void useStore.getState().quickCreateToday(key === 'md' ? 'md' : 'txt')}
        >
          <Dropdown.Section>
            <Header className="data-mono max-w-52 truncate" title={targetDir ?? ''}>
              in {targetDir ? prettyPath(targetDir) : '—'}
            </Header>
            <Dropdown.Item id="md" textValue={todayName('md')}>
              <FileText className="size-4 shrink-0 text-(--icon-doc)" />
              <Label>{todayName('md')}</Label>
            </Dropdown.Item>
            <Dropdown.Item id="txt" textValue={todayName('txt')}>
              <FileType className="size-4 shrink-0 text-(--muted)" />
              <Label>{todayName('txt')}</Label>
            </Dropdown.Item>
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

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
                {active.roots.length > 0 && <QuickCreateMenu />}
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
