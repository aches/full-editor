import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { dialog, shell } from 'electron'
import type { CreateResult, DirEntry, FileOpenResult, FileWriteRequest, FileWriteResult, RenameResult, WriteResult } from '@shared/types'
import { TEXT_HARD_LIMIT, TEXT_SOFT_LIMIT } from '@shared/types'
import { isImageFile } from '@shared/file-kinds'
import { localFileUrl } from '@shared/file-url'
import { allRootPaths } from './project-store'
import { atomicWrite, fileRevision, serializeWrite } from './atomic-write'
import { grantFile, hasFileGrant } from './file-grants'
import { mainWindow } from '../window'

/** Resolve aliases consistently, including a deleted file whose parent still exists. */
async function canonicalFilePath(path: string): Promise<string> {
  try {
    return await fsp.realpath(resolve(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return join(await fsp.realpath(dirname(resolve(path))), basename(path))
  }
}

/**
 * A path is accessible when its real location is inside (or is) one of the
 * project roots. Realpath comparison defeats `..` tricks and symlinks that
 * point outside the roots.
 */
export async function isPathAllowed(target: string): Promise<boolean> {
  let real: string
  try {
    real = await canonicalFilePath(target)
  } catch {
    return false
  }
  if (hasFileGrant(real)) return true
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

/** Files the OS asks us to open (Finder, `open -a`) get an exact-file grant unless a project already covers them. */
export async function grantOpenedFile(path: string): Promise<string | null> {
  try {
    if (!(await fsp.stat(path)).isFile()) return null
    if (!(await isPathAllowed(path))) await grantFile(await canonicalFilePath(path))
    return resolve(path)
  } catch {
    return null
  }
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
      return { type: 'image', url: localFileUrl(resolve(filePath)), size: st.size }
    }
    if (st.size > TEXT_HARD_LIMIT) {
      return { type: 'too-large', size: st.size, limit: TEXT_HARD_LIMIT }
    }
    const buf = await fsp.readFile(filePath)
    if (looksBinary(buf)) {
      return { type: 'binary', size: st.size }
    }
    return { type: 'text', content: buf.toString('utf8'), size: st.size, readOnly: st.size > TEXT_SOFT_LIMIT, revision: createHash('sha256').update(buf).digest('hex') }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    const code = e.code === 'ENOENT' ? 'ENOENT' : e.code === 'EACCES' || e.code === 'EPERM' ? 'EACCES' : 'UNKNOWN'
    return { type: 'error', code, message: e.message ?? String(err) }
  }
}

export async function writeTextFile(filePath: string, content: string, options: FileWriteRequest): Promise<FileWriteResult> {
  try {
    if (!options || !(options.expectedRevision === null || typeof options.expectedRevision === 'string' && /^[a-f0-9]{64}$/.test(options.expectedRevision))) {
      return { ok: false, code: 'EINVAL', message: 'Saving requires the revision of the last opened file.' }
    }
    if (!(await isPathAllowed(filePath))) {
      return { ok: false, code: 'EACCES', message: 'File is outside the project roots and selected files.' }
    }
    const destination = await canonicalFilePath(filePath)
    return await serializeWrite(destination, async () => {
      const validateRevision = async (): Promise<void> => {
        if (!(await isPathAllowed(destination))) throw Object.assign(new Error('File access changed. Please use Save As.'), { code: 'EACCES' })
        if (await fileRevision(destination) !== options.expectedRevision) {
          throw Object.assign(new Error('The file changed or was deleted on disk. Review the current version before saving, or use Save As.'), { code: 'CONFLICT' })
        }
      }
      await validateRevision()
      await atomicWrite(destination, content, validateRevision)
      return { ok: true, revision: createHash('sha256').update(content, 'utf8').digest('hex'), path: resolve(filePath) }
    })
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'UNKNOWN', message: e.message ?? String(err) }
  }
}

export async function saveAs(sourcePath: string, content: string, forbiddenPaths: string[] = []): Promise<FileWriteResult> {
  const win = mainWindow()
  if (!win) return { ok: false, code: 'CANCELLED', message: 'No active window.' }
  try {
    const result = await dialog.showSaveDialog(win, { defaultPath: sourcePath, title: 'Save As', buttonLabel: 'Save' })
    if (result.canceled || !result.filePath) return { ok: false, code: 'CANCELLED', message: 'Save As cancelled.' }
    const destination = await canonicalFilePath(result.filePath)
    for (const forbidden of forbiddenPaths) {
      const canonical = await canonicalFilePath(forbidden).catch(() => resolve(forbidden))
      if (canonical === destination) return { ok: false, code: 'ALREADY_OPEN', message: 'This destination is already open in another tab. Choose a different file.' }
    }
    const revision = await fileRevision(destination)
    if (revision !== null) {
      const overwrite = await dialog.showMessageBox(win, {
        type: 'warning', title: 'Replace existing file?', message: `Replace “${basename(destination)}”?`,
        detail: 'The file currently on disk will be replaced with this document. Changes made after this confirmation will stop the save.',
        buttons: ['Cancel', 'Replace'], defaultId: 0, cancelId: 0, noLink: true
      })
      if (overwrite.response !== 1) return { ok: false, code: 'CANCELLED', message: 'Replacement cancelled.' }
    }
    await grantFile(destination)
    return await writeTextFile(destination, content, { expectedRevision: revision })
  } catch (error) {
    const e = error as NodeJS.ErrnoException
    return { ok: false, code: e.code ?? 'UNKNOWN', message: e.message ?? String(error) }
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
