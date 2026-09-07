import type { StateCreator } from 'zustand'
import type { SearchResponse } from '@shared/types'
import type { AppStore } from './index'

export interface SearchSlice {
  searchQuery: string
  searchCaseSensitive: boolean
  searchRegex: boolean
  searching: boolean
  searchResponse: SearchResponse | null

  setSearchQuery: (q: string) => void
  toggleSearchCase: () => void
  toggleSearchRegex: () => void
  runSearch: () => Promise<void>
  clearSearch: () => void
}

export const createSearchSlice: StateCreator<AppStore, [], [], SearchSlice> = (set, get) => ({
  searchQuery: '',
  searchCaseSensitive: false,
  searchRegex: false,
  searching: false,
  searchResponse: null,

  setSearchQuery: (q) => set({ searchQuery: q }),
  toggleSearchCase: () => set((s) => ({ searchCaseSensitive: !s.searchCaseSensitive })),
  toggleSearchRegex: () => set((s) => ({ searchRegex: !s.searchRegex })),

  runSearch: async () => {
    const { searchQuery, searchCaseSensitive, searchRegex } = get()
    const active = get().activeProject()
    if (!active || !searchQuery.trim()) {
      set({ searchResponse: null })
      return
    }
    set({ searching: true })
    try {
      const response = await window.api.search.run({
        roots: active.roots.map((r) => r.path),
        query: searchQuery,
        caseSensitive: searchCaseSensitive,
        regex: searchRegex
      })
      set({ searchResponse: response })
    } finally {
      set({ searching: false })
    }
  },

  clearSearch: () => set({ searchQuery: '', searchResponse: null })
})
