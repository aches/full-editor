import type { StateCreator } from 'zustand'
import { toast } from '@heroui/react'
import type { Project } from '@shared/types'
import type { AppStore } from './index'
import type { ProjectModalState } from './app-types'

export interface ProjectsSlice {
  projects: Project[]
  activeProjectId: string | null
  projectModal: ProjectModalState
  confirmDeleteProjectId: string | null

  activeProject: () => Project | undefined
  syncWatcherRoots: () => void
  loadProjects: () => Promise<void>
  createProject: (name: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  switchProject: (id: string) => Promise<void>
  addRootsToActive: () => Promise<void>
  addRootPaths: (paths: string[]) => Promise<void>
  removeRoot: (rootId: string) => Promise<void>
  setProjectModal: (modal: ProjectModalState) => void
  setConfirmDeleteProject: (id: string | null) => void
}

export const createProjectsSlice: StateCreator<AppStore, [], [], ProjectsSlice> = (set, get) => ({
  projects: [],
  activeProjectId: null,
  projectModal: null,
  confirmDeleteProjectId: null,

  activeProject: () => {
    const { projects, activeProjectId } = get()
    return projects.find((p) => p.id === activeProjectId)
  },

  syncWatcherRoots: () => {
    const roots = get().activeProject()?.roots.map((r) => r.path) ?? []
    void window.api.watch.setRoots(roots)
  },

  loadProjects: async () => {
    const snap = await window.api.projects.getAll()
    set({ projects: snap.projects, activeProjectId: snap.activeProjectId })
    get().resetTree()
    get().syncWatcherRoots()
  },

  createProject: async (name) => {
    const project = await window.api.projects.create(name)
    set((s) => ({ projects: [...s.projects, project], activeProjectId: project.id }))
    get().resetTree()
    get().closeAllTabs()
    get().syncWatcherRoots()
  },

  renameProject: async (id, name) => {
    const updated = await window.api.projects.rename(id, name)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }))
  },

  deleteProject: async (id) => {
    const snap = await window.api.projects.remove(id)
    set({ projects: snap.projects, activeProjectId: snap.activeProjectId })
    get().resetTree()
    get().closeAllTabs()
    get().syncWatcherRoots()
  },

  switchProject: async (id) => {
    if (id === get().activeProjectId) return
    if (get().tabs.some((t) => t.dirty)) {
      toast('Unsaved changes', {
        description: 'Save or discard your changes before switching projects.',
        variant: 'warning'
      })
      return
    }
    await window.api.projects.setActive(id)
    set({ activeProjectId: id })
    get().resetTree()
    get().closeAllTabs()
    get().syncWatcherRoots()
  },

  addRootsToActive: async () => {
    const paths = await window.api.dialog.pickDirectories()
    await get().addRootPaths(paths)
  },

  addRootPaths: async (paths) => {
    const active = get().activeProject()
    if (!active || paths.length === 0) return
    const updated = await window.api.projects.addRoots(active.id, paths)
    set((s) => ({ projects: s.projects.map((p) => (p.id === active.id ? updated : p)) }))
    get().syncWatcherRoots()
  },

  removeRoot: async (rootId) => {
    const active = get().activeProject()
    if (!active) return
    const updated = await window.api.projects.removeRoot(active.id, rootId)
    set((s) => ({ projects: s.projects.map((p) => (p.id === active.id ? updated : p)) }))
    get().pruneTreeForRemovedRoot()
    get().syncWatcherRoots()
  },

  setProjectModal: (modal) => set({ projectModal: modal }),
  setConfirmDeleteProject: (id) => set({ confirmDeleteProjectId: id })
})
