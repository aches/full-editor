import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import type { LanguageId } from '@shared/file-kinds'

const cache = new Map<LanguageId, Extension>()
const inflight = new Map<LanguageId, Promise<Extension | null>>()

const loaders: Partial<Record<LanguageId, () => Promise<Extension>>> = {
  markdown: () => import('@codemirror/lang-markdown').then((m) => m.markdown()),
  yaml: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
  json: () => import('@codemirror/lang-json').then((m) => m.json()),
  javascript: () => import('@codemirror/lang-javascript').then((m) => m.javascript()),
  jsx: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ jsx: true })),
  typescript: () => import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true })),
  tsx: () =>
    import('@codemirror/lang-javascript').then((m) => m.javascript({ typescript: true, jsx: true })),
  html: () => import('@codemirror/lang-html').then((m) => m.html()),
  css: () => import('@codemirror/lang-css').then((m) => m.css()),
  python: () => import('@codemirror/lang-python').then((m) => m.python()),
  xml: () => import('@codemirror/lang-xml').then((m) => m.xml()),
  sql: () => import('@codemirror/lang-sql').then((m) => m.sql()),
  shell: () => import('@codemirror/legacy-modes/mode/shell').then((m) => StreamLanguage.define(m.shell)),
  toml: () => import('@codemirror/legacy-modes/mode/toml').then((m) => StreamLanguage.define(m.toml)),
  dockerfile: () =>
    import('@codemirror/legacy-modes/mode/dockerfile').then((m) => StreamLanguage.define(m.dockerFile)),
  properties: () =>
    import('@codemirror/legacy-modes/mode/properties').then((m) => StreamLanguage.define(m.properties)),
  log: () => import('./log-highlight').then((m) => m.logHighlight())
}

/** Resolve the (dynamically imported) CodeMirror extension for a language. */
export function loadLanguage(id: LanguageId): Promise<Extension | null> {
  const cached = cache.get(id)
  if (cached) return Promise.resolve(cached)
  const loader = loaders[id]
  if (!loader) return Promise.resolve(null)
  let p = inflight.get(id)
  if (!p) {
    p = loader()
      .then((ext) => {
        cache.set(id, ext)
        inflight.delete(id)
        return ext
      })
      .catch(() => {
        inflight.delete(id)
        return null
      })
    inflight.set(id, p)
  }
  return p
}
