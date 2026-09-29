import type { LanguageId } from '@shared/file-kinds'

export type ViewerKind = 'editor' | 'image' | 'binary' | 'large' | 'error'

export interface TabMeta {
  id: string
  path: string
  name: string
  viewer: ViewerKind
  language: LanguageId
  readOnly: boolean
  dirty: boolean
  size: number
  imageUrl?: string
  errorMessage?: string
  revision?: string | null
  saving?: boolean
  recovered?: boolean
  conflict?: {
    type: 'changed' | 'missing' | 'unavailable'
    message?: string
    diskContent?: string
    diskRevision?: string
  }
}

export type ProjectModalState = { mode: 'create' } | { mode: 'rename'; projectId: string } | null
