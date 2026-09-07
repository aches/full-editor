import { FileWarning, HardDrive, OctagonAlert } from 'lucide-react'
import { TEXT_HARD_LIMIT } from '@shared/types'
import type { TabMeta } from '@/stores/app-types'
import { formatBytes } from '@/lib/format'
import { prettyPath } from '@/lib/paths'

function Shell({
  icon,
  title,
  children
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-(--radius) border border-(--separator) text-(--muted)">
        {icon}
      </div>
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">{title}</p>
        <div className="max-w-md space-y-1 text-xs leading-relaxed text-(--muted)">{children}</div>
      </div>
    </div>
  )
}

export function BinaryState({ tab }: { tab: TabMeta }): React.ReactElement {
  return (
    <Shell icon={<FileWarning className="size-5" />} title="Binary file">
      <p>This file contains binary data and can’t be shown as text.</p>
      <p className="data-mono">
        {prettyPath(tab.path)} · {formatBytes(tab.size)}
      </p>
    </Shell>
  )
}

export function TooLargeState({ tab }: { tab: TabMeta }): React.ReactElement {
  return (
    <Shell icon={<HardDrive className="size-5" />} title="File too large">
      <p>
        Files over {formatBytes(TEXT_HARD_LIMIT)} aren’t opened in the editor to keep the app fast.
      </p>
      <p className="data-mono">
        {prettyPath(tab.path)} · {formatBytes(tab.size)}
      </p>
    </Shell>
  )
}

export function ErrorState({ tab }: { tab: TabMeta }): React.ReactElement {
  return (
    <Shell icon={<OctagonAlert className="size-5" />} title="Couldn’t open file">
      <p>{tab.errorMessage ?? 'Unknown error.'}</p>
      <p className="data-mono">{prettyPath(tab.path)}</p>
    </Shell>
  )
}
