import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { Project, ProjectStoreSnapshot } from '@shared/types'
import { JsonStore } from './json-store'

interface ProjectsFile {
  version: number
  activeProjectId: string | null
  projects: Project[]
}

let store: JsonStore<ProjectsFile> | null = null

function ensure(): JsonStore<ProjectsFile> {
  if (!store) {
    store = new JsonStore<ProjectsFile>(join(app.getPath('userData'), 'projects.json'), () => ({
      version: 1,
      activeProjectId: null,
      projects: []
    }))
  }
  return store
}

export async function loadProjects(): Promise<void> {
  await ensure().load()
}

export function flushProjectsSync(): void {
  store?.flushSync()
}

export function snapshot(): ProjectStoreSnapshot {
  const { activeProjectId, projects } = ensure().data
  return { activeProjectId, projects }
}

function mustFind(id: string): Project {
  const p = ensure().data.projects.find((x) => x.id === id)
  if (!p) throw new Error(`project not found: ${id}`)
  return p
}

export function createProject(name: string): Project {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('project name is empty')
  const now = Date.now()
  const project: Project = { id: randomUUID(), name: trimmed, roots: [], createdAt: now, updatedAt: now }
  ensure().update((d) => {
    d.projects.push(project)
    d.activeProjectId = project.id
  })
  return project
}

export function renameProject(id: string, name: string): Project {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('project name is empty')
  ensure().update(() => {
    const p = mustFind(id)
    p.name = trimmed
    p.updatedAt = Date.now()
  })
  return mustFind(id)
}

export function deleteProject(id: string): ProjectStoreSnapshot {
  ensure().update((d) => {
    d.projects = d.projects.filter((p) => p.id !== id)
    if (d.activeProjectId === id) d.activeProjectId = d.projects[0]?.id ?? null
  })
  return snapshot()
}

export function setActiveProject(id: string | null): void {
  ensure().update((d) => {
    d.activeProjectId = id && d.projects.some((p) => p.id === id) ? id : null
  })
}

export function addRoots(id: string, paths: string[]): Project {
  ensure().update(() => {
    const p = mustFind(id)
    for (const path of paths) {
      if (!p.roots.some((r) => r.path === path)) {
        p.roots.push({ id: randomUUID(), path })
      }
    }
    p.updatedAt = Date.now()
  })
  return mustFind(id)
}

export function removeRoot(id: string, rootId: string): Project {
  ensure().update(() => {
    const p = mustFind(id)
    p.roots = p.roots.filter((r) => r.id !== rootId)
    p.updatedAt = Date.now()
  })
  return mustFind(id)
}

/** Every root path across all projects — the allowlist for fs access. */
export function allRootPaths(): string[] {
  return ensure().data.projects.flatMap((p) => p.roots.map((r) => r.path))
}
