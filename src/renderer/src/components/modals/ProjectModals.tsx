import { useEffect, useState } from 'react'
import { AlertDialog, Button, Input, Label, Modal, TextField } from '@heroui/react'
import { useStore } from '@/stores'

export function ProjectFormModal(): React.ReactElement {
  const modal = useStore((s) => s.projectModal)
  const projects = useStore((s) => s.projects)
  const [name, setName] = useState('')

  const renaming = modal?.mode === 'rename' ? projects.find((p) => p.id === modal.projectId) : undefined

  useEffect(() => {
    if (modal?.mode === 'rename') setName(renaming?.name ?? '')
    else if (modal?.mode === 'create') setName('')
  }, [modal, renaming?.name])

  const submit = (): void => {
    const store = useStore.getState()
    const trimmed = name.trim()
    if (!trimmed) return
    if (modal?.mode === 'create') void store.createProject(trimmed)
    else if (modal?.mode === 'rename' && renaming) void store.renameProject(renaming.id, trimmed)
    store.setProjectModal(null)
  }

  return (
    <Modal isOpen={modal !== null} onOpenChange={(open) => !open && useStore.getState().setProjectModal(null)}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[380px]">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <Modal.Header>
                <Modal.Heading>{modal?.mode === 'rename' ? 'Rename Project' : 'New Project'}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <TextField autoFocus aria-label="Project name" value={name} onChange={setName}>
                  <Label>Project name</Label>
                  <Input placeholder="e.g. infra-notes" />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={() => useStore.getState().setProjectModal(null)}>
                  Cancel
                </Button>
                <Button isDisabled={!name.trim()} type="submit" variant="primary">
                  {modal?.mode === 'rename' ? 'Rename' : 'Create'}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export function DeleteProjectDialog(): React.ReactElement {
  const confirmId = useStore((s) => s.confirmDeleteProjectId)
  const projects = useStore((s) => s.projects)
  const target = projects.find((p) => p.id === confirmId)

  return (
    <AlertDialog
      isOpen={confirmId !== null}
      onOpenChange={(open) => !open && useStore.getState().setConfirmDeleteProject(null)}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Delete “{target?.name}”?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                The project and its folder list will be removed. Files on disk are <strong>not</strong>{' '}
                touched.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => useStore.getState().setConfirmDeleteProject(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onPress={() => {
                  const store = useStore.getState()
                  if (confirmId) void store.deleteProject(confirmId)
                  store.setConfirmDeleteProject(null)
                }}
              >
                Delete Project
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

export function CloseDirtyTabDialog(): React.ReactElement {
  const pendingId = useStore((s) => s.pendingCloseTabId)
  const tabs = useStore((s) => s.tabs)
  const tab = tabs.find((t) => t.id === pendingId)

  return (
    <AlertDialog
      isOpen={pendingId !== null}
      onOpenChange={(open) => !open && useStore.getState().setPendingClose(null)}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Save changes to “{tab?.name}”?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>Your changes will be lost if you don’t save them.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => useStore.getState().setPendingClose(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onPress={() => {
                  if (pendingId) useStore.getState().forceCloseTab(pendingId)
                }}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  if (pendingId) void useStore.getState().saveAndCloseTab(pendingId)
                }}
              >
                Save &amp; Close
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
