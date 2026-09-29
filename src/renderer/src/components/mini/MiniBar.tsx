import { Button, Tooltip } from '@heroui/react'
import { Maximize2, Save } from 'lucide-react'
import { useStore } from '@/stores'
import type { TabMeta } from '@/stores/app-types'
import ExportMenu from '@/components/viewers/ExportMenu'

export default function MiniBar({ tab }: { tab: TabMeta | undefined }): React.ReactElement {
  return (
    <div className="app-drag flex h-9 shrink-0 items-center justify-between border-b border-(--separator) pr-1.5 pl-3">
      <span className="flex min-w-0 items-center gap-2">
        {tab?.dirty && <span className="size-1.5 shrink-0 rounded-full bg-(--accent)" />}
        <span className="truncate text-xs font-medium">{tab?.name ?? 'Full Editor'}</span>
      </span>
      <span className="app-no-drag flex shrink-0 items-center gap-0.5">
        {tab && <ExportMenu tabId={tab.id} compact />}
        {tab?.viewer === 'editor' && !tab.readOnly && (
          <Tooltip delay={500}>
            <Button
              isIconOnly
              aria-label="Save"
              isDisabled={!tab.dirty}
              size="sm"
              variant="ghost"
              onPress={() => void useStore.getState().saveTab(tab.id)}
            >
              <Save className="size-3.5" />
            </Button>
            <Tooltip.Content>Save (⌘S)</Tooltip.Content>
          </Tooltip>
        )}
        <Tooltip delay={500}>
          <Button
            isIconOnly
            aria-label="Exit mini mode"
            size="sm"
            variant="ghost"
            onPress={() => void useStore.getState().toggleMini()}
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <Tooltip.Content>Exit mini mode (⌘⇧M)</Tooltip.Content>
        </Tooltip>
      </span>
    </div>
  )
}
