import DOMPurify from 'dompurify'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { highlightCode } from '@lezer/highlight'
import { toast } from '@heroui/react'
import type { ExportFormat, ExportRequest } from '@shared/types'
import type { TabMeta } from '@/stores/app-types'
import { useStore } from '@/stores'
import { currentDoc } from '@/editor/doc-registry'
import { codeHighlightStyle } from '@/editor/cm-theme'
import { loadLanguage } from '@/editor/languages'
import { extOf } from '@shared/file-kinds'
import { localFileUrl } from '@shared/file-url'
import markdownCss from '@/styles/markdown.css?raw'
import exportCss from '@/styles/export.css?raw'

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/** Build a complete document from the captured buffer, never the virtualized viewport. */
export async function buildExportRequest(
  tab: TabMeta,
  source: string,
  format: ExportFormat,
  forbiddenPaths: string[]
): Promise<ExportRequest> {
  const computed = getComputedStyle(document.documentElement)
  const variables = [
    'background', 'foreground', 'muted', 'accent', 'separator', 'background-secondary',
    'background-tertiary', 'danger', 'danger-soft', 'warning', 'warning-soft', 'radius', 'font-ui', 'font-mono',
    ...['keyword', 'string', 'number', 'constant', 'comment', 'function', 'type', 'property', 'attribute',
      'tag', 'operator', 'variable', 'meta', 'link', 'heading', 'regexp', 'gutter'].map((key) => `cm-${key}`)
  ].map((name) => `--${name}:${computed.getPropertyValue(`--${name}`)};`).join('')
  let html = ''
  if (tab.viewer === 'editor' && tab.language === 'markdown') {
    const { renderMarkdown } = await import('./markdown')
    const content = document.createElement('template')
    content.innerHTML = renderMarkdown(source)
    // Resolve Markdown assets relative to this document, rather than the app URL.
    const base = localFileUrl(tab.path)
    for (const img of content.content.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? ''
      if (/^(?:data:|editor-file:)/i.test(src)) continue
      const resolved = new URL(src, base)
      if (resolved.protocol === 'editor-file:' || resolved.protocol === 'file:') {
        img.src = `editor-file://local${resolved.pathname}${resolved.search}${resolved.hash}`
      }
    }
    html = `<article class="md-root">${content.innerHTML}</article>`
  } else if (tab.viewer === 'editor' && extOf(tab.name) === 'svg') {
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml')
    if (!parsed.querySelector('parsererror') && parsed.documentElement.localName === 'svg') {
      const svg = DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true } })
      html = `<figure class="export-image"><img alt="${escapeHtml(tab.name)}" src="data:image/svg+xml;charset=utf-8,${escapeHtml(encodeURIComponent(svg))}"></figure>`
    }
  } else if (tab.viewer === 'image') {
    html = `<figure class="export-image"><img alt="${escapeHtml(tab.name)}" src="${escapeHtml(localFileUrl(tab.path))}"></figure>`
  }

  if (!html && tab.viewer === 'editor') {
    const language = await loadLanguage(tab.language)
    const state = EditorState.create({ doc: source, extensions: language ? [language] : [] })
    const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state)
    const lines: string[] = []
    let line = ''
    highlightCode(state.doc.toString(), tree, codeHighlightStyle, (text, classes) => {
      line += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text)
    }, () => { lines.push(line); line = '' })
    lines.push(line)
    html = `<div class="export-code">${lines.map((text, index) => `<div class="export-line"><span class="line-number">${index + 1}</span><code>${text || '<br>'}</code></div>`).join('')}</div>`
  } else if (!html) {
    const title = tab.viewer === 'binary' ? 'Binary file' : tab.viewer === 'large' ? 'File too large' : 'Couldn’t open file'
    const message = tab.viewer === 'binary' ? 'This file contains binary data and can’t be shown as text.'
      : tab.viewer === 'large' ? 'This file exceeds the editor’s supported text size.' : tab.errorMessage ?? 'Unknown error.'
    html = `<section class="export-fallback"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(tab.name)}</p><p>${escapeHtml(message)}</p></section>`
  }
  // A second sanitization also covers generated asset attributes and code text.
  html = DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|editor-file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  })
  return {
    format, sourcePath: tab.path, forbiddenPaths, html,
    css: `:root{${variables}}\n${markdownCss}\n${codeHighlightStyle.module?.getRules() ?? ''}\n${exportCss}`
  }
}

/** Shared by the view toolbar, mini toolbar and native File menu. */
export async function exportTab(format: ExportFormat, tabId = useStore.getState().activeTabId): Promise<boolean> {
  const store = useStore.getState()
  if (store.exporting || store.transitionBusy || !store.sessionReady) return false
  const tab = store.tabs.find((item) => item.id === tabId)
  if (!tab) return false
  const source = tab.viewer === 'editor' ? currentDoc(tab.id) : ''
  const forbiddenPaths = store.tabs.map((item) => item.path)
  useStore.setState({ exporting: true })
  try {
    const request = await buildExportRequest(tab, source, format, forbiddenPaths)
    const result = await window.api.export.document(request)
    if (!result.ok) {
      if (result.code !== 'CANCELLED') toast('Export failed', { description: result.message, variant: 'danger' })
      return false
    }
    toast('Export complete', { description: result.path, variant: 'success' })
    return true
  } catch (error) {
    toast('Export failed', { description: error instanceof Error ? error.message : String(error), variant: 'danger' })
    return false
  } finally {
    useStore.setState({ exporting: false })
  }
}
