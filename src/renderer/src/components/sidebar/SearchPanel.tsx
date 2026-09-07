import { Fragment, useEffect, useRef } from 'react'
import { Button, Input, Spinner, TextField, Tooltip } from '@heroui/react'
import { CaseSensitive, Regex } from 'lucide-react'
import { useStore } from '@/stores'
import { prettyPath } from '@/lib/paths'
import { FileIcon } from '../tree/file-icon'

function OptionToggle({
  active,
  label,
  icon,
  onPress
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onPress: () => void
}): React.ReactElement {
  return (
    <Tooltip delay={500}>
      <Button
        isIconOnly
        aria-label={label}
        aria-pressed={active}
        className={`size-6 min-w-6 ${active ? 'bg-(--accent-soft) text-(--accent)' : 'text-(--muted)'}`}
        size="sm"
        variant="ghost"
        onPress={onPress}
      >
        {icon}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  )
}

export default function SearchPanel(): React.ReactElement {
  const query = useStore((s) => s.searchQuery)
  const caseSensitive = useStore((s) => s.searchCaseSensitive)
  const regex = useStore((s) => s.searchRegex)
  const searching = useStore((s) => s.searching)
  const response = useStore((s) => s.searchResponse)
  const focusNonce = useStore((s) => s.searchFocusNonce)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusNonce])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-2.5 pb-2">
        <TextField
          aria-label="Search in project"
          value={query}
          onChange={(v) => useStore.getState().setSearchQuery(v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void useStore.getState().runSearch()
          }}
        >
          <Input ref={inputRef} placeholder="Search in project…  (Enter)" />
        </TextField>
        <div className="mt-1.5 flex items-center gap-1">
          <OptionToggle
            active={caseSensitive}
            icon={<CaseSensitive className="size-4" />}
            label="Match case"
            onPress={() => useStore.getState().toggleSearchCase()}
          />
          <OptionToggle
            active={regex}
            icon={<Regex className="size-3.5" />}
            label="Regular expression"
            onPress={() => useStore.getState().toggleSearchRegex()}
          />
          {searching && <Spinner className="ml-auto" size="sm" />}
          {!searching && response && (
            <span className="data-mono ml-auto text-(--muted)">
              {response.totalMatches} in {response.files.length} files
              {response.truncated ? '+' : ''} · {response.tookMs}ms
            </span>
          )}
        </div>
        {response?.error && <p className="mt-1 text-xs text-(--danger)">{response.error}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {response && response.files.length === 0 && !response.error && (
          <p className="px-3 pt-4 text-center text-xs text-(--muted)">No results.</p>
        )}
        {response?.files.map((file) => (
          <Fragment key={file.path}>
            <div
              className="flex h-[26px] items-center gap-1.5 truncate px-2.5 pt-1 text-[12.5px] font-medium"
              title={file.path}
            >
              <FileIcon entry={{ name: file.name, kind: 'file' }} />
              <span className="truncate">{file.name}</span>
              <span className="data-mono shrink-0 text-(--muted)">{file.matches.length}</span>
              <span className="data-mono min-w-0 flex-1 truncate text-right text-(--muted)">
                {prettyPath(file.path)}
              </span>
            </div>
            {file.matches.map((m, i) => (
              <div
                key={`${file.path}:${m.line}:${m.column}:${i}`}
                className="flex h-[22px] cursor-default items-center gap-2 pr-2 pl-7 hover:bg-(--background-tertiary)"
                onClick={() => {
                  void useStore.getState().openFileAtLocation(file.path, m.line, m.column)
                }}
              >
                <span className="data-mono w-8 shrink-0 text-right text-(--muted)">{m.line}</span>
                <span className="truncate font-(family-name:--font-mono) text-xs">{m.preview}</span>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
