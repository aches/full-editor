import { createWriteStream, promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>

/** Streams to `<dest>.part` and renames only after the byte count checks out, so a partial file never looks installable. */
export async function downloadToFile(
  fetchImpl: Fetch,
  url: string,
  dest: string,
  options: { expectedSize?: number; onProgress?: (fraction: number | null) => void; signal?: AbortSignal } = {}
): Promise<void> {
  const response = await fetchImpl(url, { signal: options.signal })
  if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status}).`)
  const total = Number(response.headers.get('content-length')) || options.expectedSize || 0
  const part = `${dest}.part`
  let received = 0
  const source = Readable.fromWeb(response.body as never)
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    options.onProgress?.(total ? Math.min(received / total, 1) : null)
  })
  try {
    await pipeline(source, createWriteStream(part))
    if ((total && received !== total) || received === 0) throw new Error('The download was incomplete. Please try again.')
    await fs.rename(part, dest)
  } catch (error) {
    await fs.rm(part, { force: true })
    throw error
  }
}
