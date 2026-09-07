import { useState } from 'react'
import type { TabMeta } from '@/stores/app-types'
import { formatBytes } from '@/lib/format'

export default function ImageViewer({ tab }: { tab: TabMeta }): React.ReactElement {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="checkerboard flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
        <img
          alt={tab.name}
          className="max-h-full max-w-full object-contain shadow-sm"
          src={tab.imageUrl}
          onLoad={(e) => {
            const img = e.currentTarget
            setDims({ w: img.naturalWidth, h: img.naturalHeight })
          }}
        />
      </div>
      <div className="data-mono flex h-7 shrink-0 items-center justify-center gap-3 border-t border-(--separator) text-(--muted)">
        <span>{tab.name}</span>
        {dims && (
          <span>
            {dims.w} × {dims.h}
          </span>
        )}
        <span>{formatBytes(tab.size)}</span>
      </div>
    </div>
  )
}
