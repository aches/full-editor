/**
 * Pure data tables mapping file names/extensions to how the app treats them.
 * Used by both the main process (open decisions) and the renderer (icons,
 * language loading). No runtime imports here.
 */

export type LanguageId =
  | 'markdown'
  | 'yaml'
  | 'json'
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'html'
  | 'css'
  | 'python'
  | 'xml'
  | 'sql'
  | 'shell'
  | 'toml'
  | 'dockerfile'
  | 'properties'
  | 'log'
  | 'plain'

const EXT_TO_LANGUAGE: Record<string, LanguageId> = {
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  html: 'html',
  htm: 'html',
  vue: 'html',
  svelte: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  py: 'python',
  xml: 'xml',
  plist: 'xml',
  svg: 'xml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  toml: 'toml',
  ini: 'properties',
  properties: 'properties',
  conf: 'properties',
  env: 'properties',
  gitignore: 'properties',
  npmrc: 'properties',
  editorconfig: 'properties',
  log: 'log',
  txt: 'plain',
  lock: 'plain',
  csv: 'plain',
  tsv: 'plain'
}

const FILENAME_TO_LANGUAGE: Record<string, LanguageId> = {
  dockerfile: 'dockerfile',
  makefile: 'plain',
  license: 'plain',
  '.gitignore': 'properties',
  '.gitattributes': 'properties',
  '.npmrc': 'properties',
  '.editorconfig': 'properties',
  '.env': 'properties'
}

export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif'])

/** svg opens as text (it's XML) but can also be previewed as an image. */
export const SVG_EXT = 'svg'

export function extOf(name: string): string {
  const base = name.toLowerCase()
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1)
}

export function languageFor(fileName: string): LanguageId {
  const base = fileName.toLowerCase()
  const byName = FILENAME_TO_LANGUAGE[base]
  if (byName) return byName
  if (base.startsWith('.env.')) return 'properties'
  if (base.startsWith('dockerfile.')) return 'dockerfile'
  const lang = EXT_TO_LANGUAGE[extOf(base)]
  return lang ?? 'plain'
}

export function isImageFile(fileName: string): boolean {
  return IMAGE_EXTS.has(extOf(fileName))
}
