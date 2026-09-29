import { createServer, loadConfigFromFile } from 'vite'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'full-editor-smoke-'))
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, join(root, 'electron.vite.config.ts'))
const server = await createServer({ ...loaded.config.renderer, root: join(root, 'src/renderer'), configFile: false, server: { host: '127.0.0.1', port: 0 } })
await server.listen()
let child
try {
  const url = server.resolvedUrls.local[0]
  const entry = process.argv[2] === 'export' ? 'electron-export-smoke.cjs' : 'electron-smoke.cjs'
  child = spawn(require('electron'), [join(root, 'tests', entry)], {
    cwd: root, stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: url, EDITOR_SMOKE_DIR: temporary }
  })
  const code = await new Promise((done, reject) => { child.on('exit', done); child.on('error', reject) })
  process.exitCode = code ?? 1
} finally {
  child?.kill()
  await server.close()
  if (!process.exitCode) await rm(temporary, { recursive: true, force: true })
  else console.error(`Smoke data retained at ${temporary}`)
}
