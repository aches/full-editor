import { create } from 'zustand'
import { createProjectsSlice, type ProjectsSlice } from './projects.slice'
import { createTreeSlice, type TreeSlice } from './tree.slice'
import { createTabsSlice, type TabsSlice } from './tabs.slice'
import { createUiSlice, type UiSlice } from './ui.slice'
import { createSearchSlice, type SearchSlice } from './search.slice'
import { createWorkspaceSlice, type WorkspaceSlice } from './workspace.slice'

export type AppStore = ProjectsSlice & TreeSlice & TabsSlice & UiSlice & SearchSlice & WorkspaceSlice

export const useStore = create<AppStore>()((...a) => ({
  ...createProjectsSlice(...a),
  ...createTreeSlice(...a),
  ...createTabsSlice(...a),
  ...createUiSlice(...a),
  ...createSearchSlice(...a),
  ...createWorkspaceSlice(...a)
}))
