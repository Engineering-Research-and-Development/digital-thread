import type { UploadType } from './enums'

export interface FileReference {
  fileId: string
  iterationId: string
  iterationDisplayId?: string
  iterationStatus?: string
  nodeId: string
  nodeLabel?: string
  role: 'OUTPUT' | 'INPUT'
  outputId?: string
  inputId?: string
}

export interface FileRecord {
  id: string
  path: string
  bucket: string
  filename: string
  timestamp: string
  // Nullable for RAW (unattached) files.
  nodeSourceId: string | null
  nodeSourceLabel: string | null
  iterationId: string | null
  /** NODE (iteration-produced) | RAW (standalone upload). */
  attachmentKind?: string
  /** Governance classification (PUBLIC/INTERNAL/PARTNER/CONFIDENTIAL/RESTRICTED). */
  classification?: string
  uploadType: UploadType
  sourceInfo: string
  sizeBytes: number
  contentType: string
  /**
   * Every (iteration × node) reference to this file — origin OUTPUT plus any
   * INPUT usages (forked iterations consuming the file as a PREDECESSOR input).
   * Populated by the backend list endpoint; falls back to `[]` for legacy
   * responses.
   */
  references?: FileReference[]
}

export interface FileFilters {
  search?: string
  nodeSourceId?: string
  uploadType?: UploadType
  iterationId?: string
  dateFrom?: string
  dateTo?: string
}
