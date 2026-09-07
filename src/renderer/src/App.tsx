import { useEffect, useRef } from 'react'
import { Toast } from '@heroui/react'
import { useStore } from '@/stores'
import { useWindowEvents } from '@/hooks/useWindowEvents'
import TitleBar from '@/components/titlebar/TitleBar'
import Sidebar from '@/components/sidebar/Sidebar'
import TabStrip from '@/components/tabs/TabStrip'
import ViewerSwitch from '@/components/viewers/ViewerSwitch'
import MiniBar from '@/components/mini/MiniBar'
import { NoTabState } from '@/components/common/EmptyState'
import {
  CloseDirtyTabDialog,
  DeleteProjectDialog,
  ProjectFormModal
} from '@/components/modals/ProjectModals'
import { FsNameModal, TrashConfirmDialog } from '@/components/modals/FsModals'
import './styles/editor.css'
import './styles/markdown.css'

function SidebarResizer(): React.ReactElement {
  const dragging = useRef(false)

  const onMouseDown = (e: React.MouseEvent): void => {
    dragging.current = true
    const startX = e.clientX
    const startWidth = useStore.getState().sidebarWidth
    const onMove = (ev: MouseEvent): void => {
      if (dragging.current) useStore.getState().setSidebarWidth(startWidth + ev.clientX - startX)
    }
    const onUp = (): void => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  return (
    <div
      className="-mx-[3px] w-[6px] shrink-0 cursor-col-resize transition-colors hover:bg-(--accent-soft)"
      onMouseDown={onMouseDown}
    />
  )
}

function EditorArea(): React.ReactElement {
  const tabs = useStore((s) => s.tabs)
  const activeTab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId))

  if (tabs.length === 0) {
    return (
      <main className="min-w-0 flex-1">
        <NoTabState />
      </main>
    )
  }
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <TabStrip />
      <div className="min-h-0 flex-1">{activeTab && <ViewerSwitch tab={activeTab} />}</div>
    </main>
  )
}

function MiniLayout(): React.ReactElement {
  const activeTab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId))

  return (
    <div className="flex h-full flex-col">
      <MiniBar tab={activeTab} />
      <div className="min-h-0 flex-1">
        {activeTab ? (
          <ViewerSwitch tab={activeTab} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="text-xs leading-relaxed text-(--muted)">
              No file open.
              <br />
              Exit mini mode to pick one.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  const miniMode = useStore((s) => s.miniMode)
  useWindowEvents()

  useEffect(() => {
    const store = useStore.getState()
    void store.initWindowState()
    void store.loadProjects()
  }, [])

  return (
    <>
      {miniMode ? (
        <MiniLayout />
      ) : (
        <div className="flex h-full flex-col">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <SidebarResizer />
            <EditorArea />
          </div>
        </div>
      )}
      <ProjectFormModal />
      <DeleteProjectDialog />
      <CloseDirtyTabDialog />
      <FsNameModal />
      <TrashConfirmDialog />
      <Toast.Provider />
    </>
  )
}
