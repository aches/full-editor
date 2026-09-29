import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] })).href)
const sandbox = await fs.mkdtemp(join(tmpdir(), 'editor-update-'))
const outfile = join(sandbox, 'update.mjs')
await build({ entryPoints: [resolve('src/shared/update.ts')], outfile, bundle: true, platform: 'node', format: 'esm' })
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
