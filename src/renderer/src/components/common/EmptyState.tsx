import { Button, Kbd } from '@heroui/react'
import { FolderPlus, PackagePlus } from 'lucide-react'
import { useStore } from '@/stores'

export function NoProjectState(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-(--radius) border border-(--separator) text-(--muted)">
        <PackagePlus className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-medium">No project yet</p>
        <p className="max-w-56 text-xs leading-relaxed text-(--muted)">
          A project groups folders from anywhere on disk into one file tree.
        </p>
      </div>
      <Button size="sm" variant="primary" onPress={() => useStore.getState().setProjectModal({ mode: 'create' })}>
        New Project
      </Button>
    </div>
  )
}

export function NoRootsState(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-(--radius) border border-(--separator) text-(--muted)">
        <FolderPlus className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-medium">Empty project</p>
        <p className="max-w-56 text-xs leading-relaxed text-(--muted)">
          Add one or more folders — each becomes a root in the tree.
        </p>
      </div>
      <Button size="sm" variant="secondary" onPress={() => void useStore.getState().addRootsToActive()}>
        Add Folder…
      </Button>
    </div>
  )
}

export function NoTabState(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <p className="text-sm text-(--muted)">Select a file from the tree to open it</p>
      <div className="space-y-2">
        <ShortcutHint keys={['⌘', 'P']} label="Open file by name" />
        <ShortcutHint keys={['⌘', '⇧', 'F']} label="Find in project" />
        <ShortcutHint keys={['⌘', 'S']} label="Save file" />
        <ShortcutHint keys={['⌘', 'W']} label="Close tab" />
        <ShortcutHint keys={['⌘', '⇧', 'M']} label="Mini mode" />
      </div>
    </div>
  )
}

function ShortcutHint({ keys, label }: { keys: string[]; label: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-8 text-xs text-(--muted)">
      <span>{label}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <Kbd key={k}>
            <Kbd.Content>{k}</Kbd.Content>
          </Kbd>
        ))}
      </span>
    </div>
  )
}
