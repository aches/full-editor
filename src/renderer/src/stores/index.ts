import { create } from 'zustand'
import { createProjectsSlice, type ProjectsSlice } from './projects.slice'
import { createTreeSlice, type TreeSlice } from './tree.slice'
import { createTabsSlice, type TabsSlice } from './tabs.slice'
import { createUiSlice, type UiSlice } from './ui.slice'
import { createSearchSlice, type SearchSlice } from './search.slice'

export type AppStore = ProjectsSlice & TreeSlice & TabsSlice & UiSlice & SearchSlice

export const useStore = create<AppStore>()((...a) => ({
  ...createProjectsSlice(...a),
  ...createTreeSlice(...a),
  ...createTabsSlice(...a),
  ...createUiSlice(...a),
  ...createSearchSlice(...a)
}))
