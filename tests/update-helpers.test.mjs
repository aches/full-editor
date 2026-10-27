import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] })).href)
const sandbox = await fs.mkdtemp(join(tmpdir(), 'editor-update-'))
const outfile = join(sandbox, 'update.mjs')
await build({ entryPoints: [resolve('src/shared/update.ts')], outfile, bundle: true, platform: 'node', format: 'esm' })
const downloadOut = join(sandbox, 'download.mjs')
await build({ entryPoints: [resolve('src/main/services/download.ts')], outfile: downloadOut, bundle: true, platform: 'node', format: 'esm' })
const { downloadToFile } = await import(pathToFileURL(downloadOut).href)
const { isNewerVersion, pickDownloadUrl, isMarkdownPath, isTrustedReleaseUrl } = await import(pathToFileURL(outfile).href)

test('version comparison', () => {
  assert.equal(isNewerVersion('v0.3.0', '0.2.0'), true)
  assert.equal(isNewerVersion('0.2.10', '0.2.9'), true)
  assert.equal(isNewerVersion('0.2.0', '0.2.0'), false)
  assert.equal(isNewerVersion('0.1.9', '0.2.0'), false)
  assert.equal(isNewerVersion('1.0.0', '1.0.0-beta.1'), true)
  assert.equal(isNewerVersion('1.0.0-beta.2', '1.0.0-beta.10'), false)
  assert.equal(isNewerVersion('nightly', '0.2.0'), false)
})

test('download asset selection', () => {
  const base = 'https://github.com/aches/full-editor/releases/download/v1.0.0/'
  const release = {
    tag_name: 'v1.0.0', html_url: 'https://github.com/aches/full-editor/releases/tag/v1.0.0',
    assets: [
      { name: 'full-editor-1.0.0-arm64.zip', browser_download_url: `${base}full-editor-1.0.0-arm64.zip` },
      { name: 'full-editor-1.0.0-x64.dmg', browser_download_url: `${base}full-editor-1.0.0-x64.dmg` },
      { name: 'full-editor-1.0.0-arm64.dmg', browser_download_url: `${base}full-editor-1.0.0-arm64.dmg` }
    ]
  }
  assert.equal(pickDownloadUrl(release, 'arm64'), `${base}full-editor-1.0.0-arm64.dmg`)
  assert.equal(pickDownloadUrl({ ...release, assets: [] }, 'arm64'), release.html_url)
  const hostile = { ...release, assets: [{ name: 'x.dmg', browser_download_url: 'https://evil.example/x.dmg' }] }
  assert.equal(pickDownloadUrl(hostile, 'arm64'), release.html_url)
  assert.equal(isTrustedReleaseUrl('http://github.com/aches/full-editor/x'), false)
})

test('markdown path detection', () => {
  assert.equal(isMarkdownPath('/a/b/README.MD'), true)
  assert.equal(isMarkdownPath('notes.markdown'), true)
  assert.equal(isMarkdownPath('/a/.md'), false)
  assert.equal(isMarkdownPath('/a/b.txt'), false)
})

test('installer download streams to disk and rejects truncated bodies', async () => {
  const payload = Buffer.alloc(300_000, 7)
  const server = createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200, { 'content-length': payload.length }); res.end(payload) }
    else if (req.url === '/short') { res.writeHead(200, { 'content-length': payload.length }); res.write(payload.subarray(0, 1000)); res.destroy() }
    else { res.writeHead(404); res.end() }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const dest = join(sandbox, 'ok.dmg')
    const seen = []
    await downloadToFile(fetch, `${base}/ok`, dest, { onProgress: (f) => seen.push(f) })
    assert.equal((await fs.readFile(dest)).length, payload.length)
    assert.equal(seen.at(-1), 1)
    await assert.rejects(downloadToFile(fetch, `${base}/short`, join(sandbox, 'short.dmg')))
    await assert.rejects(fs.stat(join(sandbox, 'short.dmg')))
    await assert.rejects(fs.stat(join(sandbox, 'short.dmg.part')))
    await assert.rejects(downloadToFile(fetch, `${base}/missing`, join(sandbox, 'missing.dmg')), /HTTP 404/)
  } finally { server.close() }
})
