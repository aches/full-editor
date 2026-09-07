import {
  Braces,
  Container,
  Database,
  File,
  FileCode,
  FileImage,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  FolderSymlink,
  Globe,
  Palette,
  ScrollText,
  Settings2,
  SquareTerminal
} from 'lucide-react'
import type { DirEntry } from '@shared/types'
import { isImageFile, languageFor, type LanguageId } from '@shared/file-kinds'

interface IconSpec {
  Icon: React.ComponentType<{ className?: string }>
  tint: string
}

const LANGUAGE_ICONS: Partial<Record<LanguageId, IconSpec>> = {
  markdown: { Icon: FileText, tint: 'text-(--icon-doc)' },
  yaml: { Icon: FileCode, tint: 'text-(--icon-config)' },
  json: { Icon: Braces, tint: 'text-(--icon-config)' },
  javascript: { Icon: FileCode, tint: 'text-(--icon-code)' },
  typescript: { Icon: FileCode, tint: 'text-(--icon-code)' },
  jsx: { Icon: FileCode, tint: 'text-(--icon-code)' },
  tsx: { Icon: FileCode, tint: 'text-(--icon-code)' },
  html: { Icon: Globe, tint: 'text-(--icon-markup)' },
  css: { Icon: Palette, tint: 'text-(--icon-markup)' },
  python: { Icon: FileCode, tint: 'text-(--icon-code)' },
  xml: { Icon: FileCode, tint: 'text-(--icon-markup)' },
  sql: { Icon: Database, tint: 'text-(--icon-data)' },
  shell: { Icon: SquareTerminal, tint: 'text-(--icon-shell)' },
  toml: { Icon: Settings2, tint: 'text-(--icon-config)' },
  dockerfile: { Icon: Container, tint: 'text-(--icon-shell)' },
  properties: { Icon: Settings2, tint: 'text-(--icon-config)' },
  log: { Icon: ScrollText, tint: 'text-(--icon-log)' },
  plain: { Icon: FileType, tint: 'text-(--muted)' }
}

export function FileIcon({
  entry,
  expanded
}: {
  entry: Pick<DirEntry, 'name' | 'kind'>
  expanded?: boolean
}): React.ReactElement {
  const cls = 'size-4 shrink-0'
  if (entry.kind === 'symlink-dir') return <FolderSymlink className={`${cls} text-(--icon-folder)`} />
  if (entry.kind === 'dir') {
    const FolderIcon = expanded ? FolderOpen : Folder
    return <FolderIcon className={`${cls} text-(--icon-folder)`} />
  }
  if (isImageFile(entry.name)) return <FileImage className={`${cls} text-(--icon-media)`} />
  const spec = LANGUAGE_ICONS[languageFor(entry.name)]
  if (!spec) return <File className={`${cls} text-(--muted)`} />
  return <spec.Icon className={`${cls} ${spec.tint}`} />
}
