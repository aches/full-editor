import type { StateCreator } from 'zustand'
import type { ThemePref } from '@shared/types'
import type { AppStore } from './index'

export type MdViewMode = 'edit' | 'split' | 'preview'
export type SidebarMode = 'files' | 'search'

export interface UiSlice {
  miniMode: boolean
  opacity: number
  pinned: boolean
  themePref: ThemePref
  systemDark: boolean
  sidebarWidth: number
  mdViewByTab: Record<string, MdViewMode>
  svgPreviewByTab: Record<string, boolean>
  sidebarMode: SidebarMode
  searchFocusNonce: number

  resolvedDark: () => boolean
  initWindowState: () => Promise<void>
  setOpacity: (value: number) => Promise<void>
  togglePinned: () => Promise<void>
  toggleMini: () => Promise<void>
  applyMiniMode: (on: boolean) => void
  setThemePref: (pref: ThemePref) => Promise<void>
  setSystemDark: (dark: boolean) => void
  setSidebarWidth: (width: number) => void
  setMdView: (tabId: string, mode: MdViewMode) => void
  setSvgPreview: (tabId: string, on: boolean) => void
  setSidebarMode: (mode: SidebarMode) => void
  focusSearch: () => void
}

function applyThemeToDom(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', dark)
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set, get) => ({
  miniMode: false,
  opacity: 1,
  pinned: false,
  themePref: 'system',
  systemDark: false,
  sidebarWidth: 260,
  mdViewByTab: {},
  svgPreviewByTab: {},
  sidebarMode: 'files',
  searchFocusNonce: 0,

  resolvedDark: () => {
    const { themePref, systemDark } = get()
    return themePref === 'system' ? systemDark : themePref === 'dark'
  },

  initWindowState: async () => {
    const s = await window.api.window.getState()
    set({
      miniMode: s.miniMode,
      opacity: s.opacity,
      pinned: s.pinned,
      themePref: s.themePref,
      systemDark: s.systemDark
    })
    applyThemeToDom(get().resolvedDark())
  },

  setOpacity: async (value) => {
    const applied = await window.api.window.setOpacity(value)
    set({ opacity: applied })
  },

  togglePinned: async () => {
    const applied = await window.api.window.setAlwaysOnTop(!get().pinned)
    set({ pinned: applied })
  },

  toggleMini: async () => {
    const res = await window.api.window.setMiniMode(!get().miniMode)
    set({ miniMode: res.miniMode })
  },

  applyMiniMode: (on) => set({ miniMode: on }),

  setThemePref: async (pref) => {
    set({ themePref: pref })
    applyThemeToDom(get().resolvedDark())
    await window.api.window.setThemePref(pref)
  },

  setSystemDark: (dark) => {
    set({ systemDark: dark })
    applyThemeToDom(get().resolvedDark())
  },

  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(420, Math.max(200, width)) }),

  setMdView: (tabId, mode) =>
    set((s) => ({ mdViewByTab: { ...s.mdViewByTab, [tabId]: mode } })),

  setSvgPreview: (tabId, on) =>
    set((s) => ({ svgPreviewByTab: { ...s.svgPreviewByTab, [tabId]: on } })),

  setSidebarMode: (mode) => set({ sidebarMode: mode }),

  focusSearch: () =>
    set((s) => ({ sidebarMode: 'search', searchFocusNonce: s.searchFocusNonce + 1 }))
})
