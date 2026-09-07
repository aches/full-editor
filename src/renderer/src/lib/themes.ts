export interface PaletteDef {
  id: string
  label: string
  mode: 'light' | 'dark'
  /** Representative color for the theme picker swatch. */
  swatch: string
  accent: string
}

export const PALETTES: PaletteDef[] = [
  { id: 'paper', label: 'Paper', mode: 'light', swatch: '#f6f5f2', accent: '#2e7d64' },
  { id: 'solarized-light', label: 'Solarized Light', mode: 'light', swatch: '#fdf6e3', accent: '#268bd2' },
  { id: 'graphite', label: 'Graphite', mode: 'dark', swatch: '#232327', accent: '#7fd0b4' },
  { id: 'one-dark', label: 'One Dark', mode: 'dark', swatch: '#282c34', accent: '#61afef' },
  { id: 'dracula', label: 'Dracula', mode: 'dark', swatch: '#282a36', accent: '#bd93f9' }
]

export const DEFAULT_LIGHT_PALETTE = 'paper'
export const DEFAULT_DARK_PALETTE = 'graphite'

export function paletteById(id: string): PaletteDef | undefined {
  return PALETTES.find((p) => p.id === id)
}

export function resolvePalette(palette: string, dark: boolean): string {
  if (palette !== 'auto' && paletteById(palette)) return palette
  return dark ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE
}
