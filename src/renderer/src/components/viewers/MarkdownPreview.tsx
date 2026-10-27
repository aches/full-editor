import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@heroui/react'
import { currentDoc, subscribeDocChanges } from '@/editor/doc-registry'
import { followMarkdownLink } from '@/lib/follow-link'
import { useStore } from '@/stores'

const RERENDER_DEBOUNCE_MS = 250

/**
 * Renders the tab's LIVE document (unsaved edits included) and keeps itself
 * in sync while the user types (split view). markdown-it and DOMPurify load
 * on first use via dynamic import.
 */
export default function MarkdownPreview({ tabId }: { tabId: string }): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)
  const articleRef = useRef<HTMLElement>(null)
  const pendingGoto = useStore((s) => s.pendingGoto)
  const previewOnly = useStore((s) => s.mdViewByTab[tabId] === 'preview')

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const render = (): void => {
      void import('@/lib/markdown').then(({ renderMarkdown }) => {
        if (alive) setHtml(renderMarkdown(currentDoc(tabId)))
      })
    }
    render()

    const unsubscribe = subscribeDocChanges((changedTabId) => {
      if (changedTabId !== tabId) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(render, RERENDER_DEBOUNCE_MS)
    })

    return () => {
      alive = false
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [tabId])

  // Preview-only tabs have no editor to consume a goto (followed `#L12` / `#heading`).
  useEffect(() => {
    const article = articleRef.current
    if (!pendingGoto || !previewOnly || !article) return
    const store = useStore.getState()
    if (store.tabs.find((t) => t.id === tabId)?.path !== pendingGoto.path) return
    let best: Element | null = null
    for (const el of article.querySelectorAll('[data-source-line]')) {
      if (Number(el.getAttribute('data-source-line')) > pendingGoto.line) break
      best = el
    }
    best?.scrollIntoView({ block: 'start' })
    store.setPendingGoto(null)
  }, [pendingGoto, previewOnly, tabId, html])

  const scrollToHeading = (slug: string): void => {
    const el = articleRef.current?.querySelector(`[data-heading-slug="${CSS.escape(slug.toLowerCase())}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <article
        ref={articleRef}
        className="md-root md-line-numbers mx-auto max-w-3xl py-6 pr-8 pl-16 select-text"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          // Web links open in the system browser; local links open in a tab.
          const anchor = (e.target as HTMLElement).closest('a')
          if (anchor) {
            e.preventDefault()
            void followMarkdownLink(anchor.getAttribute('href') ?? '', tabId, scrollToHeading)
          }
        }}
      />
    </div>
  )
}
