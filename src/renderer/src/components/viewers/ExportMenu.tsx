import { Button, Dropdown, Label } from '@heroui/react'
import { Download, FileImage, FileText, LoaderCircle } from 'lucide-react'
import { useStore } from '@/stores'
import type { ExportFormat } from '@shared/types'

export default function ExportMenu({ tabId, compact = false }: { tabId: string; compact?: boolean }): React.ReactElement {
  const exporting = useStore((s) => s.exporting)
  const disabled = useStore((s) => s.transitionBusy || !s.sessionReady)
  return (
    <Dropdown>
      <Button isIconOnly={compact} isDisabled={disabled || exporting} aria-label="Export file" size="sm" variant="ghost">
        {exporting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {!compact && <span>{exporting ? 'Exporting…' : 'Export'}</span>}
      </Button>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          aria-label="Export format"
          onAction={(key) => {
            void import('@/lib/export-document').then(({ exportTab }) => exportTab(key as ExportFormat, tabId))
          }}
        >
          <Dropdown.Item id="png" textValue="PNG Image">
            <FileImage className="size-4" /><Label>PNG Image…</Label>
          </Dropdown.Item>
          <Dropdown.Item id="pdf" textValue="PDF Document">
            <FileText className="size-4" /><Label>PDF Document…</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
