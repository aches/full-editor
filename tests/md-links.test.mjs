import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: [dirname(require.resolve('vite'))] })).href)
const sandbox = await fs.mkdtemp(join(tmpdir(), 'editor-md-links-'))
const bundle = async (entry, name) => {
  const outfile = join(sandbox, name)
  await build({ entryPoints: [resolve(entry)], outfile, bundle: true, platform: 'node', format: 'esm' })
  return import(pathToFileURL(outfile).href)
}
const { resolveMarkdownLink, slugifyHeading } = await bundle('src/renderer/src/lib/md-links.ts', 'md-links.mjs')
const { headingLine } = await bundle('src/renderer/src/lib/markdown.ts', 'markdown.mjs')

const FROM = '/repo/docs/guide.md'

test('resolves relative, absolute and encoded file links', () => {
  assert.deepEqual(resolveMarkdownLink('./api.md', FROM), { kind: 'file', path: '/repo/docs/api.md' })
  assert.deepEqual(resolveMarkdownLink('../README.md', FROM), { kind: 'file', path: '/repo/README.md' })
  assert.deepEqual(resolveMarkdownLink('/etc/hosts', FROM), { kind: 'file', path: '/etc/hosts' })
  assert.deepEqual(resolveMarkdownLink('my%20notes.md?x=1', FROM), { kind: 'file', path: '/repo/docs/my notes.md' })
  assert.deepEqual(resolveMarkdownLink('<a b.md>', FROM), { kind: 'file', path: '/repo/docs/a b.md' })
  assert.deepEqual(resolveMarkdownLink('file:///tmp/x.log', FROM), { kind: 'file', path: '/tmp/x.log' })
})

test('splits fragments into lines and headings', () => {
  assert.deepEqual(resolveMarkdownLink('#Intro', FROM), { kind: 'heading', slug: 'Intro' })
  assert.deepEqual(resolveMarkdownLink('src/a.ts#L12-L20', FROM), { kind: 'file', path: '/repo/docs/src/a.ts', line: 12 })
  assert.deepEqual(resolveMarkdownLink('api.md#%E5%AE%89%E8%A3%85', FROM), { kind: 'file', path: '/repo/docs/api.md', slug: '安装' })
})

test('web links are external, other schemes are ignored', () => {
  assert.deepEqual(resolveMarkdownLink('https://example.com/a#b', FROM), { kind: 'external', url: 'https://example.com/a#b' })
  assert.equal(resolveMarkdownLink('javascript:alert(1)', FROM), null)
  assert.equal(resolveMarkdownLink('mailto:a@b.c', FROM), null)
  assert.equal(resolveMarkdownLink('  ', FROM), null)
})

test('heading slugs match GitHub and locate source lines', () => {
  assert.equal(slugifyHeading('Hello, World!'), 'hello-world')
  assert.equal(slugifyHeading('快速 开始'), '快速-开始')
  const src = '# Title\n\ntext\n\n## Set `up`\n\n## Set up\n\n> ### Quoted\n'
  assert.equal(headingLine(src, 'title'), 1)
  assert.equal(headingLine(src, 'set-up'), 5)
  assert.equal(headingLine(src, 'set-up-1'), 7)
  assert.equal(headingLine(src, 'Quoted'), 9)
  assert.equal(headingLine(src, 'missing'), null)
})
