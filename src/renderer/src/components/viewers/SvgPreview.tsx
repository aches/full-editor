import { useMemo } from 'react'

/** Renders an SVG file (edited as XML text) as an image off disk. */
export default function SvgPreview({ path, nonce }: { path: string; nonce: number }): React.ReactElement {
  // nonce busts the cache after a save so the preview reflects disk content.
  const src = useMemo(() => `editor-file://local${encodeURI(path)}?v=${nonce}`, [path, nonce])
  return (
    <div className="checkerboard flex h-full items-center justify-center overflow-auto p-8">
      <img alt={path} className="max-h-full max-w-full object-contain" src={src} />
    </div>
  )
}
