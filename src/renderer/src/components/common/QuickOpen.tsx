import { useEffect, useRef, useState } from 'react'
import { Kbd } from '@heroui/react'
import { Search } from 'lucide-react'
import type { QuickOpenEntry } from '@shared/types'
import { useStore } from '@/stores'
import { FileIcon } from '../tree/file-icon'

const QUERY_DEBOUNCE_MS = 120

/**
 * ⌘P command-palette style file-name search across the active project's
 * roots. Fully keyboard driven: type → ↑/↓ → Enter, Esc to dismiss.
 */
export default function QuickOpen(): React.ReactElement | null {
  const visible = useStore((s) => s.quickOpenVisible)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<QuickOpenEntry[]>([])
  const [indexSize, setIndexSize] = useState(0)
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (visible) {
      setQuery('')
      setEntries([])
      setSelected(0)
      // Focus after the overlay paints.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const seq = ++requestSeq.current
    setPending(true)
    const timer = setTimeout(async () => {
      const active = useStore.getState().activeProject()
      if (!active) return
      const res = await window.api.search.files(
        active.roots.map((r) => r.path),
        query
      )
      if (seq !== requestSeq.current) return
      setEntries(res.entries)
      setIndexSize(res.indexSize)
      setSelected(0)
      setPending(false)
    }, QUERY_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, visible])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!visible) return null

  const close = (): void => useStore.getState().setQuickOpenVisible(false)

  const openEntry = (entry: QuickOpenEntry): void => {
    close()
    void useStore.getState().openFile(entry.path, entry.name)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close()
      e.preventDefault()
    } else if (e.key === 'ArrowDown') {
      setSelected((i) => Math.min(i + 1, entries.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setSelected((i) => Math.max(i - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (entries[selected]) openEntry(entries[selected])
      e.preventDefault()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onMouseDown={close}>
      <div
        className="flex max-h-[60vh] w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-(--radius) border border-(--separator) bg-(--overlay) shadow-(--overlay-shadow)"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-(--separator) px-3">
          <Search className="size-4 shrink-0 text-(--muted)" />
          <input
            ref={inputRef}
            className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-(--muted)"
            placeholder="Search files by name…"
            spellCheck={false}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <Kbd>
            <Kbd.Content>esc</Kbd.Content>
          </Kbd>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {query.trim() === '' ? (
            <p className="px-4 py-3 text-xs text-(--muted)">
              Type to search {indexSize > 0 ? `${indexSize} files` : 'files'} across all project folders.
            </p>
          ) : entries.length === 0 ? (
            <p className="px-4 py-3 text-xs text-(--muted)">
              {pending ? 'Searching…' : 'No matching files.'}
            </p>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.path}
                className={`flex h-8 cursor-default items-center gap-2 px-3 ${
                  i === selected ? 'bg-(--accent-soft)' : 'hover:bg-(--background-tertiary)'
                }`}
                data-index={i}
                onClick={() => openEntry(entry)}
                onMouseMove={() => setSelected(i)}
              >
                <FileIcon entry={{ name: entry.name, kind: 'file' }} />
                <span className="shrink-0 text-[13px]">{entry.name}</span>
                <span className="data-mono min-w-0 flex-1 truncate text-(--muted)">{entry.dir}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
