import { promises as fsp } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { shell } from 'electron'
import type { CreateResult, DirEntry, FileOpenResult, RenameResult, WriteResult } from '@shared/types'
import { TEXT_HARD_LIMIT, TEXT_SOFT_LIMIT } from '@shared/types'
import { isImageFile } from '@shared/file-kinds'
import { allRootPaths } from './project-store'

/**
 * A path is accessible when its real location is inside (or is) one of the
 * project roots. Realpath comparison defeats `..` tricks and symlinks that
 * point outside the roots.
 */
export async function isPathAllowed(target: string): Promise<boolean> {
  let real: string
  try {
    real = await fsp.realpath(resolve(target))
  } catch {
    return false
  }
  for (const root of allRootPaths()) {
    let rootReal: string
    try {
      rootReal = await fsp.realpath(root)
    } catch {
      continue
    }
    if (real === rootReal || real.startsWith(rootReal + sep)) return true
  }
  return false
}

export async function readDirSorted(dirPath: string): Promise<DirEntry[]> {
  if (!(await isPathAllowed(dirPath))) throw new Error(`path outside project roots: ${dirPath}`)
  const dirents = await fsp.readdir(dirPath, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map(async (d): Promise<DirEntry | null> => {
      const full = resolve(dirPath, d.name)
      try {
        if (d.isSymbolicLink()) {
          const st = await fsp.stat(full)
          return {
            name: d.name,
            path: full,
            kind: st.isDirectory() ? 'symlink-dir' : 'symlink-file',
            size: st.isDirectory() ? 0 : st.size
          }
        }
        if (d.isDirectory()) return { name: d.name, path: full, kind: 'dir', size: 0 }
        if (d.isFile()) {
          const st = await fsp.stat(full)
          return { name: d.name, path: full, kind: 'file', size: st.size }
        }
        return null
      } catch {
        // Broken symlink or vanished entry — skip rather than fail the listing.
        return null
      }
    })
  )
  const isDir = (e: DirEntry): boolean => e.kind === 'dir' || e.kind === 'symlink-dir'
  return entries
    .filter((e): e is DirEntry => e !== null)
    .sort((a, b) => {
      if (isDir(a) !== isDir(b)) return isDir(a) ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
    })
}

function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192)
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

export async function openFile(filePath: string): Promise<FileOpenResult> {
  try {
    if (!(await isPathAllowed(filePath))) {
      return { type: 'error', code: 'EACCES', message: 'File is outside the project roots.' }
    }
    const st = await fsp.stat(filePath)
    if (isImageFile(filePath)) {
      return { type: 'image', url: `editor-file://local${encodeURI(resolve(filePath))}`, size: st.size }
    }
    if (st.size > TEXT_HARD_LIMIT) {
      return { type: 'too-large', size: st.size, limit: TEXT_HARD_LIMIT }
    }
    const buf = await fsp.readFile(filePath)
    if (looksBinary(buf)) {
      return { type: 'binary', size: st.size }
    }
    return { type: 'text', content: buf.toString('utf8'), size: st.size, readOnly: st.size > TEXT_SOFT_LIMIT }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    const code = e.code === 'ENOENT' ? 'ENOENT' : e.code === 'EACCES' || e.code === 'EPERM' ? 'EACCES' : 'UNKNOWN'
    return { type: 'error', code, message: e.message ?? String(err) }
  }
}

export async function writeTextFile(filePath: string, content: string): Promise<WriteResult> {
  try {
    if (!(await isPathAllowed(filePath))) {
      return { ok: false, code: 'EACCES', message: 'File is outside the project roots.' }
    }
    await fsp.writeFile(filePath, content, 'utf8')
    return { ok: true }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'UNKNOWN', message: e.message ?? String(err) }
  }
}

function validEntryName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !name.includes('/') && !name.includes('\0') && name !== '.' && name !== '..'
}

export async function createFile(dirPath: string, name: string): Promise<CreateResult> {
  try {
    if (!validEntryName(name)) return { ok: false, code: 'EINVAL', message: 'Invalid file name.' }
    if (!(await isPathAllowed(dirPath))) {
      return { ok: false, code: 'EACCES', message: 'Folder is outside the project roots.' }
    }
    const target = join(resolve(dirPath), name)
    await fsp.writeFile(target, '', { flag: 'wx' })
    return { ok: true, path: target }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    const message = e.code === 'EEXIST' ? 'A file with that name already exists.' : (e.message ?? String(err))
    return { ok: false, code: e.code ?? 'UNKNOWN', message }
  }
}

export async function createDir(dirPath: string, name: string): Promise<CreateResult> {
  try {
    if (!validEntryName(name)) return { ok: false, code: 'EINVAL', message: 'Invalid folder name.' }
    if (!(await isPathAllowed(dirPath))) {
      return { ok: false, code: 'EACCES', message: 'Folder is outside the project roots.' }
    }
    const target = join(resolve(dirPath), name)
    await fsp.mkdir(target)
    return { ok: true, path: target }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    const message = e.code === 'EEXIST' ? 'A folder with that name already exists.' : (e.message ?? String(err))
    return { ok: false, code: e.code ?? 'UNKNOWN', message }
  }
}

export async function renamePath(path: string, newName: string): Promise<RenameResult> {
  try {
    if (!validEntryName(newName)) return { ok: false, code: 'EINVAL', message: 'Invalid name.' }
    if (!(await isPathAllowed(path))) {
      return { ok: false, code: 'EACCES', message: 'Path is outside the project roots.' }
    }
    const target = join(dirname(resolve(path)), newName)
    try {
      await fsp.access(target)
      return { ok: false, code: 'EEXIST', message: 'Something with that name already exists.' }
    } catch {
      /* target free — proceed */
    }
    await fsp.rename(resolve(path), target)
    return { ok: true, newPath: target }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'UNKNOWN', message: e.message ?? String(err) }
  }
}

export async function trashPath(path: string): Promise<WriteResult> {
  try {
    if (!(await isPathAllowed(path))) {
      return { ok: false, code: 'EACCES', message: 'Path is outside the project roots.' }
    }
    await shell.trashItem(resolve(path))
    return { ok: true }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'UNKNOWN', message: e.message ?? String(err) }
  }
}

export async function revealInFinder(path: string): Promise<void> {
  if (await isPathAllowed(path)) shell.showItemInFolder(resolve(path))
}

export function openExternalUrl(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}
