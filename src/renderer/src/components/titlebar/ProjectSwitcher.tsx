import { Button, Dropdown, Label, Separator } from '@heroui/react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useStore } from '@/stores'

export default function ProjectSwitcher(): React.ReactElement {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const active = projects.find((p) => p.id === activeProjectId)

  const onAction = (key: React.Key): void => {
    const store = useStore.getState()
    const k = String(key)
    if (k === 'new') store.setProjectModal({ mode: 'create' })
    else if (k === 'rename' && activeProjectId) store.setProjectModal({ mode: 'rename', projectId: activeProjectId })
    else if (k === 'delete' && activeProjectId) store.setConfirmDeleteProject(activeProjectId)
    else if (k.startsWith('project:')) void store.switchProject(k.slice('project:'.length))
  }

  return (
    <Dropdown>
      <Button className="app-no-drag max-w-56 gap-1.5 font-medium" size="sm" variant="ghost">
        <span className="truncate">{active?.name ?? 'Full Editor'}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-(--muted)" />
      </Button>
      <Dropdown.Popover className="min-w-52">
        <Dropdown.Menu onAction={onAction}>
          <>
            {projects.map((p) => (
              <Dropdown.Item key={p.id} id={`project:${p.id}`} textValue={p.name}>
                <Label>{p.name}</Label>
                {p.id === activeProjectId && <Check className="ms-auto size-4 text-(--accent)" />}
              </Dropdown.Item>
            ))}
            {projects.length > 0 && <Separator />}
            <Dropdown.Item id="new" textValue="New project">
              <Label>New Project…</Label>
            </Dropdown.Item>
            {active && (
              <Dropdown.Item id="rename" textValue="Rename project">
                <Label>Rename “{active.name}”…</Label>
              </Dropdown.Item>
            )}
            {active && (
              <Dropdown.Item id="delete" textValue="Delete project" variant="danger">
                <Label>Delete “{active.name}”…</Label>
              </Dropdown.Item>
            )}
          </>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
