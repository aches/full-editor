import type { Extension } from '@codemirror/state'
import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'

const errorLine = Decoration.line({ class: 'cm-log-error' })
const warnLine = Decoration.line({ class: 'cm-log-warn' })
const dimLine = Decoration.line({ class: 'cm-log-dim' })

const RULES: Array<[RegExp, Decoration]> = [
  [/\b(?:ERROR|ERR|FATAL|PANIC|SEVERE|CRITICAL|Exception|Traceback)\b/, errorLine],
  [/\b(?:WARN|WARNING)\b/, warnLine],
  [/\b(?:DEBUG|TRACE|VERBOSE)\b/, dimLine]
]

/** Line decorations computed for the viewport only, so huge logs stay fast. */
function buildLineDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      const text = line.text.length > 400 ? line.text.slice(0, 400) : line.text
      for (const [re, deco] of RULES) {
        if (re.test(text)) {
          builder.add(line.from, line.from, deco)
          break
        }
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

const lineHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildLineDecos(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildLineDecos(u.view)
    }
  },
  { decorations: (v) => v.decorations }
)

/** ISO-ish timestamps rendered muted so message text stands out. */
const timestampDecorator = new MatchDecorator({
  regexp: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
  decoration: Decoration.mark({ class: 'cm-log-timestamp' })
})

const timestampHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = timestampDecorator.createDeco(view)
    }
    update(u: ViewUpdate) {
      this.decorations = timestampDecorator.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations }
)

export function logHighlight(): Extension {
  return [lineHighlighter, timestampHighlighter]
}
