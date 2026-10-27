import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/stores'
import type { TabMeta } from '@/stores/app-types'
import { FileIcon } from '../tree/file-icon'
import ContextMenu, { type ContextMenuItem } from '../tree/ContextMenu'

export default function TabItem({ tab, active }: { tab: TabMeta; active: boolean }): React.ReactElement {
  const store = useStore.getState()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const index = useStore((s) => s.tabs.findIndex((t) => t.id === tab.id))
  const count = useStore((s) => s.tabs.length)
  const items: ContextMenuItem[] = [
    { key: 'close', label: 'Close' },
    ...(count > 1 ? [{ key: 'others', label: 'Close Others', separatorBefore: true }] : []),
    ...(index > 0 ? [{ key: 'left', label: 'Close to the Left' }] : []),
    ...(index >= 0 && index < count - 1 ? [{ key: 'right', label: 'Close to the Right' }] : [])
  ]

  return (
    <div
      className={`group relative flex h-[34px] max-w-52 min-w-0 shrink-0 cursor-default items-center gap-1.5 border-r border-(--separator) px-3 text-[12.5px] ${
        active ? 'text-(--foreground)' : 'text-(--muted) hover:bg-(--background-secondary)'
      }`}
      title={tab.path}
      onAuxClick={(e) => {
        if (e.button === 1) store.closeTab(tab.id)
      }}
      onClick={() => store.activateTab(tab.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <FileIcon entry={{ name: tab.name, kind: 'file' }} />
      <span className="truncate">{tab.name}</span>
      <span
        className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-full hover:bg-(--background-tertiary)"
        role="button"
        aria-label={`Close ${tab.name}`}
        onClick={(e) => {
          e.stopPropagation()
          store.closeTab(tab.id)
        }}
      >
        {tab.dirty ? (
          <>
            <span className="size-1.5 rounded-full bg-(--accent) group-hover:hidden" />
            <X className="hidden size-3 group-hover:block" />
          </>
        ) : (
          <X className="size-3 opacity-0 group-hover:opacity-100" />
        )}
      </span>
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-(--accent)" />}
      {menu && (
        <span onAuxClick={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
        <ContextMenu
          items={items}
          x={menu.x}
          y={menu.y}
          onAction={(key) => {
            const current = useStore.getState()
            if (key === 'close') void current.closeTab(tab.id)
            else void current.closeTabsRelativeTo(tab.id, key as 'left' | 'right' | 'others')
          }}
          onClose={() => setMenu(null)}
        />
        </span>
      )}
    </div>
  )
}
