import { promises as fs } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { app } from 'electron'
import { atomicWrite, serializeWrite } from './atomic-write'

const grantedFiles = new Set<string>()

export async function loadFileGrants(): Promise<void> {
  const file = join(app.getPath('userData'), 'file-grants.json')
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    if (!Array.isArray(parsed) || !parsed.every((p) => typeof p === 'string' && isAbsolute(p))) throw new Error('Invalid file grants')
    for (const path of parsed) grantedFiles.add(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export function hasFileGrant(canonicalPath: string): boolean {
  return grantedFiles.has(canonicalPath)
}

/** Native Save As selection grants only this exact canonical file, durably. */
export async function grantFile(canonicalPath: string): Promise<void> {
  const file = join(app.getPath('userData'), 'file-grants.json')
  await serializeWrite(file, async () => {
    if (grantedFiles.has(canonicalPath)) return
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await atomicWrite(file, JSON.stringify([...grantedFiles, canonicalPath]))
    grantedFiles.add(canonicalPath)
  })
}
