import { useEffect, useState } from 'react'
import { AlertDialog, Button, Input, Label, Modal, TextField } from '@heroui/react'
import { useStore } from '@/stores'
import { basename, prettyPath } from '@/lib/paths'

const TITLES = {
  'new-file': 'New File',
  'new-dir': 'New Folder',
  rename: 'Rename'
} as const

export function FsNameModal(): React.ReactElement {
  const modal = useStore((s) => s.fsModal)
  const [name, setName] = useState('')

  useEffect(() => {
    setName(modal?.initialName ?? '')
  }, [modal])

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed || !modal) return
    if (modal.mode === 'rename' && trimmed === modal.initialName) {
      useStore.getState().setFsModal(null)
      return
    }
    void useStore.getState().submitFsModal(trimmed)
  }

  return (
    <Modal isOpen={modal !== null} onOpenChange={(open) => !open && useStore.getState().setFsModal(null)}>
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
                <Modal.Heading>{modal ? TITLES[modal.mode] : ''}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <TextField autoFocus aria-label="Name" value={name} onChange={setName}>
                  <Label>
                    {modal?.mode === 'rename'
                      ? `New name for “${modal.initialName}”`
                      : `Name (in ${modal ? basename(modal.targetPath) : ''}/)`}
                  </Label>
                  <Input placeholder={modal?.mode === 'new-dir' ? 'folder-name' : 'file-name.md'} />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={() => useStore.getState().setFsModal(null)}>
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

export function TrashConfirmDialog(): React.ReactElement {
  const confirm = useStore((s) => s.confirmTrash)

  return (
    <AlertDialog
      isOpen={confirm !== null}
      onOpenChange={(open) => !open && useStore.getState().setConfirmTrash(null)}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>
                Move “{confirm?.name}” to Trash?
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="data-mono break-all">{confirm ? prettyPath(confirm.path) : ''}</p>
              <p className="mt-2">
                {confirm?.isDir ? 'The folder and everything inside it moves' : 'The file moves'} to the
                Trash and can be restored from there.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => useStore.getState().setConfirmTrash(null)}>
                Cancel
              </Button>
              <Button variant="danger" onPress={() => void useStore.getState().trashConfirmed()}>
                Move to Trash
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
