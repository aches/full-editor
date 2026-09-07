import { Button, Dropdown, Label, Popover, Separator, Slider, ToggleButton, Tooltip } from '@heroui/react'
import { Blend, Check, Monitor, Moon, PictureInPicture2, Pin, Sun } from 'lucide-react'
import { PALETTES } from '@/lib/themes'
import { useStore } from '@/stores'

function PaletteSwatch({ bg, accent }: { bg: string; accent: string }): React.ReactElement {
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center rounded-full border border-(--border)"
      style={{ background: bg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: accent }} />
    </span>
  )
}

export default function WindowControls(): React.ReactElement {
  const opacity = useStore((s) => s.opacity)
  const pinned = useStore((s) => s.pinned)
  const themePref = useStore((s) => s.themePref)
  const palette = useStore((s) => s.palette)
  const selection = themePref === 'system' || palette === 'auto' ? 'system' : palette
  const dark = useStore((s) => (s.themePref === 'system' ? s.systemDark : s.themePref === 'dark'))

  return (
    <div className="app-no-drag flex items-center gap-0.5">
      <Popover>
        <Tooltip delay={500}>
          <Button isIconOnly aria-label="Window opacity" size="sm" variant="ghost">
            <Blend className="size-4" />
          </Button>
          <Tooltip.Content>Window opacity</Tooltip.Content>
        </Tooltip>
        <Popover.Content className="w-56">
          <Popover.Dialog className="p-4">
            <Slider
              aria-label="Window opacity"
              maxValue={100}
              minValue={30}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(v) => {
                const value = Array.isArray(v) ? v[0] : v
                void useStore.getState().setOpacity(value / 100)
              }}
            >
              <div className="flex items-center justify-between pb-2">
                <Label className="text-xs">Opacity</Label>
                <Slider.Output className="data-mono text-(--muted)" />
              </div>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      <Tooltip delay={500}>
        <ToggleButton
          isIconOnly
          aria-label="Always on top"
          isSelected={pinned}
          size="sm"
          variant="ghost"
          onChange={() => void useStore.getState().togglePinned()}
        >
          <Pin className={`size-4 ${pinned ? 'text-(--accent)' : ''}`} />
        </ToggleButton>
        <Tooltip.Content>Always on top</Tooltip.Content>
      </Tooltip>

      <Tooltip delay={500}>
        <Button
          isIconOnly
          aria-label="Mini mode"
          size="sm"
          variant="ghost"
          onPress={() => void useStore.getState().toggleMini()}
        >
          <PictureInPicture2 className="size-4" />
        </Button>
        <Tooltip.Content>Mini mode (⌘⇧M)</Tooltip.Content>
      </Tooltip>

      <Dropdown>
        <Button isIconOnly aria-label="Theme" size="sm" variant="ghost">
          {selection === 'system' ? (
            <Monitor className="size-4" />
          ) : dark ? (
            <Moon className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </Button>
        <Dropdown.Popover className="min-w-48">
          <Dropdown.Menu onAction={(key) => void useStore.getState().setTheme(String(key))}>
            <>
              <Dropdown.Item id="system" textValue="System">
                <Monitor className="size-3.5 shrink-0 text-(--muted)" />
                <Label>System</Label>
                {selection === 'system' && <Check className="ms-auto size-4 text-(--accent)" />}
              </Dropdown.Item>
              <Separator />
              {PALETTES.map((p) => (
                <Dropdown.Item key={p.id} id={p.id} textValue={p.label}>
                  <PaletteSwatch accent={p.accent} bg={p.swatch} />
                  <Label>{p.label}</Label>
                  {selection === p.id && <Check className="ms-auto size-4 text-(--accent)" />}
                </Dropdown.Item>
              ))}
            </>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  )
}
