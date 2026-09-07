import { promises as fsp } from 'node:fs'
import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const SAVE_DEBOUNCE_MS = 250

/**
 * Minimal atomic JSON store: write to `<file>.tmp` then rename, debounced.
 * A corrupt file is kept as `<file>.bak` and replaced with defaults instead
 * of crashing the app.
 */
export class JsonStore<T extends { version: number }> {
  private saveTimer: NodeJS.Timeout | null = null
  private data_: T

  constructor(
    private readonly file: string,
    private readonly defaults: () => T
  ) {
    this.data_ = defaults()
  }

  get data(): T {
    return this.data_
  }

  async load(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as T
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
      this.data_ = { ...this.defaults(), ...parsed }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && existsSync(this.file)) {
        try {
          copyFileSync(this.file, `${this.file}.bak`)
        } catch {
          /* keep going with defaults */
        }
      }
      this.data_ = this.defaults()
    }
  }

  /** Mutate the data and schedule a debounced save. */
  update(mutator: (data: T) => void): void {
    mutator(this.data_)
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void this.saveNow()
    }, SAVE_DEBOUNCE_MS)
  }

  private async saveNow(): Promise<void> {
    this.saveTimer = null
    const tmp = `${this.file}.tmp`
    await fsp.mkdir(dirname(this.file), { recursive: true })
    await fsp.writeFile(tmp, JSON.stringify(this.data_, null, 2), 'utf8')
    await fsp.rename(tmp, this.file)
  }

  /** Synchronous flush for `before-quit`. */
  flushSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const tmp = `${this.file}.tmp`
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(tmp, JSON.stringify(this.data_, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }
}
