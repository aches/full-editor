import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const pending = new Map<string, Promise<unknown>>()

/** Serialize mutations to the same durable resource, including failed operations. */
export function serializeWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation)
  pending.set(key, next)
  void next.finally(() => {
    if (pending.get(key) === next) pending.delete(key)
  }).catch(() => {})
  return next
}

export async function fileRevision(path: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(path)).digest('hex')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** The callback checks constraints immediately before committing the replacement. */
export async function atomicWrite(path: string, content: string | Uint8Array, beforeCommit?: () => Promise<void>): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  let mode = 0o600
  try {
    mode = (await fs.stat(path)).mode & 0o7777
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    const handle = await fs.open(temp, 'wx', mode)
    try {
      await handle.writeFile(content, 'utf8')
      await handle.chmod(mode)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await beforeCommit?.()
    await fs.rename(temp, path)
    // Persist the directory entry as well as the replacement file's contents.
    const directory = await fs.open(dirname(path), 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } finally {
    await fs.unlink(temp).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') console.error('Could not remove save temporary file', error)
    })
  }
}
