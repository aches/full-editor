import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ContextMenuItem {
  key: string
  label: string
  danger?: boolean
  separatorBefore?: boolean
}

/**
 * Lightweight right-click menu. HeroUI's Dropdown is press-triggered, so a
 * positioned context menu is simpler done by hand.
 */
export default function ContextMenu({
  x,
  y,
  items,
  onAction,
  onClose
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onAction: (key: string) => void
  onClose: () => void
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { innerWidth, innerHeight } = window
    const rect = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, innerWidth - rect.width - 8),
      y: Math.min(y, innerHeight - rect.height - 8)
    })
  }, [x, y])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-44 rounded-(--radius) border border-(--separator) bg-(--overlay) py-1 shadow-(--overlay-shadow)"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
    >
      {items.map((item) => (
        <div key={item.key}>
          {item.separatorBefore && <div className="my-1 h-px bg-(--separator)" />}
          <button
            className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-(--background-tertiary) ${
              item.danger ? 'text-(--danger)' : 'text-(--foreground)'
            }`}
            role="menuitem"
            type="button"
            onClick={() => {
              onAction(item.key)
              onClose()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
