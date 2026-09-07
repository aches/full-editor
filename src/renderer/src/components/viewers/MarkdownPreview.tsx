import { useEffect, useState } from 'react'
import { Spinner } from '@heroui/react'
import { currentDoc, subscribeDocChanges } from '@/editor/doc-registry'

const RERENDER_DEBOUNCE_MS = 250

/**
 * Renders the tab's LIVE document (unsaved edits included) and keeps itself
 * in sync while the user types (split view). markdown-it and DOMPurify load
 * on first use via dynamic import.
 */
export default function MarkdownPreview({ tabId }: { tabId: string }): React.ReactElement {
  const [html, setHtml] = useState<string | null>(null)

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
        className="md-root mx-auto max-w-3xl px-8 py-6 select-text"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          // External links open in the system browser, never in-app.
          const anchor = (e.target as HTMLElement).closest('a')
          if (anchor) {
            e.preventDefault()
            const href = anchor.getAttribute('href') ?? ''
            if (/^https?:\/\//i.test(href)) void window.api.shell.openExternal(href)
          }
        }}
      />
    </div>
  )
}
