import type { StateCreator } from 'zustand'
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

export const createProjectsSlice: StateCreator<AppStore, [], [], ProjectsSlice> = (set, get) => {
  let loading: Promise<void> | null = null
  return {
    projects: [], activeProjectId: null, projectModal: null, confirmDeleteProjectId: null,
    activeProject: () => get().projects.find((p) => p.id === get().activeProjectId),
    syncWatcherRoots: () => {
      const roots = get().activeProject()?.roots.map((r) => r.path) ?? []
      const files = get().tabs.map((t) => t.path).filter((path) => !roots.some((root) => path.startsWith(root + '/')))
      void window.api.watch.setRoots([...roots, ...files])
    },
    loadProjects: async () => {
      if (get().sessionReady) return
      if (loading) return loading
      loading = (async () => {
        try {
          const snap = await window.api.projects.getAll()
          const session = snap.activeProjectId ? await window.api.sessions.load(snap.activeProjectId) : null
          set({ projects: snap.projects, activeProjectId: snap.activeProjectId })
          await get().restoreSession(session)
        } catch (err) {
          set({ sessionReady: false, backupError: err instanceof Error ? err.message : String(err) })
        }
      })()
      try { await loading } finally { loading = null }
    },
    createProject: async (name) => {
      await get().runGuardedAction('creating a new project', async () => {
        const project = await window.api.projects.create(name)
        set((s) => ({ projects: [...s.projects, project], activeProjectId: project.id }))
        await get().restoreSession(null)
      })
    },
    renameProject: async (id, name) => {
      const updated = await window.api.projects.rename(id, name)
      set((s) => ({ projects: s.projects.map((p) => p.id === id ? updated : p) }))
    },
    deleteProject: async (id) => {
      const deletingActive = id === get().activeProjectId
      await get().runGuardedAction('deleting this project', async () => {
        const nextId = get().projects.find((p) => p.id !== id)?.id
        const nextSession = deletingActive && nextId ? await window.api.sessions.load(nextId) : null
        const result = await window.api.sessions.remove(id)
        if (!result.ok) throw new Error(result.message)
        const snap = await window.api.projects.remove(id)
        set({ projects: snap.projects, activeProjectId: snap.activeProjectId })
        if (deletingActive) await get().restoreSession(nextSession)
      }, deletingActive ? {} : { tabIds: [] })
    },
    switchProject: async (id) => {
      if (id === get().activeProjectId || !get().projects.some((p) => p.id === id)) return
      await get().runGuardedAction('switching projects', async () => {
        // Load first. A damaged target snapshot must not destroy this workspace.
        const session = await window.api.sessions.load(id)
        await window.api.projects.setActive(id)
        set({ activeProjectId: id })
        await get().restoreSession(session)
      })
    },
    addRootsToActive: async () => {
      const paths = await window.api.dialog.pickDirectories()
      await get().addRootPaths(paths)
    },
    addRootPaths: async (paths) => {
      const active = get().activeProject()
      if (!active || paths.length === 0 || get().transitionBusy) return
      const updated = await window.api.projects.addRoots(active.id, paths)
      set((s) => ({ projects: s.projects.map((p) => p.id === active.id ? updated : p) }))
      get().syncWatcherRoots()
    },
    removeRoot: async (rootId) => {
      const active = get().activeProject()
      const root = active?.roots.find((r) => r.id === rootId)
      if (!active || !root) return
      const remaining = active.roots.filter((r) => r.id !== rootId)
      const affected = get().tabs.filter((t) =>
        (t.path === root.path || t.path.startsWith(root.path + '/')) &&
        !remaining.some((r) => t.path.startsWith(r.path + '/'))
      ).map((t) => t.id)
      await get().runGuardedAction('removing this folder from the project', async () => {
        const updated = await window.api.projects.removeRoot(active.id, rootId)
        set((s) => ({ projects: s.projects.map((p) => p.id === active.id ? updated : p) }))
        for (const id of affected) get().forceCloseTab(id)
        get().pruneTreeForRemovedRoot()
        get().syncWatcherRoots()
      }, { tabIds: affected, omitTabIds: affected })
    },
    setProjectModal: (modal) => set({ projectModal: modal }),
    setConfirmDeleteProject: (id) => set({ confirmDeleteProjectId: id })
  }
}
