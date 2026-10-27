import { currentDoc } from '@/editor/doc-registry'
import { useStore } from '@/stores'
import { basename } from './paths'
import { resolveMarkdownLink } from './md-links'

/**
 * Follow a link clicked in the markdown tab `fromTabId`. External links go to
 * the system browser; local files open in a tab (jumping to `#L12` or a
 * `#heading`). Same-document `#heading` links are handed to `onHeading`.
 */
export async function followMarkdownLink(
  href: string,
  fromTabId: string,
  onHeading: (slug: string) => void
): Promise<void> {
  const store = useStore.getState()
  const from = store.tabs.find((t) => t.id === fromTabId)
  if (!from) return
  const target = resolveMarkdownLink(href, from.path)
  if (!target) return
  if (target.kind === 'external') { void window.api.shell.openExternal(target.url); return }
  if (target.kind === 'heading') { onHeading(target.slug); return }
  if (target.path === from.path && target.slug) { onHeading(target.slug); return }

  const wasOpen = store.tabs.some((t) => t.path === target.path)
  await store.openFile(target.path, basename(target.path))
  const s = useStore.getState()
  const tab = s.activeTab()
  if (!tab || tab.path !== target.path) return
  // Reading in the preview? Keep reading the linked document there too.
  const fromMode = s.mdViewByTab[fromTabId]
  if (!wasOpen && fromMode && fromMode !== 'edit' && tab.language === 'markdown' && tab.viewer === 'editor') {
    s.setMdView(tab.id, fromMode)
  }

  let line = target.line
  if (!line && target.slug && tab.language === 'markdown' && tab.viewer === 'editor') {
    const { headingLine } = await import('./markdown')
    line = headingLine(currentDoc(tab.id), target.slug) ?? undefined
  }
  if (line) s.setPendingGoto({ path: tab.path, line, column: 0 })
}
