import { Chip, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { useStore } from '@/stores'
import type { MdViewMode } from '@/stores/ui.slice'
import type { TabMeta } from '@/stores/app-types'
import { extOf } from '@shared/file-kinds'
import { formatBytes } from '@/lib/format'
import { prettyPath } from '@/lib/paths'
import EditorHost from '@/editor/EditorHost'
import ImageViewer from './ImageViewer'
import MarkdownPreview from './MarkdownPreview'
import SvgPreview from './SvgPreview'
import { BinaryState, ErrorState, TooLargeState } from './FallbackStates'

function ViewerToolbar({
  tab,
  mdView,
  svgPreview
}: {
  tab: TabMeta
  mdView: MdViewMode
  svgPreview: boolean
}): React.ReactElement {
  const isSvg = extOf(tab.name) === 'svg'
  return (
    <div className="flex h-[34px] shrink-0 items-center justify-between gap-3 border-b border-(--separator) pr-2 pl-3">
      <span className="data-mono min-w-0 truncate text-(--muted)">{prettyPath(tab.path)}</span>
      <span className="flex shrink-0 items-center gap-2">
        {tab.readOnly && tab.viewer === 'editor' && (
          <Chip color="warning" size="sm">
            Read-only · {formatBytes(tab.size)}
          </Chip>
        )}
        {tab.language === 'markdown' && (
          <ToggleButtonGroup
            aria-label="Markdown mode"
            disallowEmptySelection
            selectedKeys={[mdView]}
            selectionMode="single"
            size="sm"
            onSelectionChange={(keys) => {
              const mode = [...keys][0] as MdViewMode | undefined
              if (mode) useStore.getState().setMdView(tab.id, mode)
            }}
          >
            <ToggleButton id="edit">Edit</ToggleButton>
            <ToggleButton id="split">
              <ToggleButtonGroup.Separator />
              Split
            </ToggleButton>
            <ToggleButton id="preview">
              <ToggleButtonGroup.Separator />
              Preview
            </ToggleButton>
          </ToggleButtonGroup>
        )}
        {isSvg && (
          <ToggleButtonGroup
            aria-label="SVG mode"
            disallowEmptySelection
            selectedKeys={[svgPreview ? 'preview' : 'code']}
            selectionMode="single"
            size="sm"
            onSelectionChange={(keys) => {
              const key = [...keys][0]
              useStore.getState().setSvgPreview(tab.id, key === 'preview')
            }}
          >
            <ToggleButton id="code">Code</ToggleButton>
            <ToggleButton id="preview">
              <ToggleButtonGroup.Separator />
              Preview
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </span>
    </div>
  )
}

export default function ViewerSwitch({ tab }: { tab: TabMeta }): React.ReactElement {
  const mdView = useStore((s) => s.mdViewByTab[tab.id] ?? 'edit')
  const svgPreview = useStore((s) => !!s.svgPreviewByTab[tab.id])
  const miniMode = useStore((s) => s.miniMode)
  // Cheap cache-bust signal for the svg preview: changes when dirty flips off (save).
  const dirty = tab.dirty

  if (tab.viewer === 'image') return <ImageViewer tab={tab} />
  if (tab.viewer === 'binary') return <BinaryState tab={tab} />
  if (tab.viewer === 'large') return <TooLargeState tab={tab} />
  if (tab.viewer === 'error') return <ErrorState tab={tab} />

  const isSvg = extOf(tab.name) === 'svg'
  const isMd = tab.language === 'markdown'

  let body: React.ReactNode
  if (isMd && mdView === 'preview') {
    body = <MarkdownPreview tabId={tab.id} />
  } else if (isMd && mdView === 'split') {
    body = (
      <div className="flex h-full min-h-0">
        <div className="min-w-0 flex-1">
          <EditorHost tabId={tab.id} />
        </div>
        <div className="w-px shrink-0 bg-(--separator)" />
        <div className="min-w-0 flex-1">
          <MarkdownPreview tabId={tab.id} />
        </div>
      </div>
    )
  } else if (isSvg && svgPreview) {
    body = <SvgPreview nonce={dirty ? 1 : 0} path={tab.path} />
  } else {
    body = <EditorHost tabId={tab.id} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!miniMode && <ViewerToolbar mdView={mdView} svgPreview={svgPreview} tab={tab} />}
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  )
}
