/**
 * Pluggable storage interface — implementations are swapped via the
 * STORAGE_PROVIDER injection token, so every reader/writer of files must go
 * through this interface rather than touching the filesystem/S3 SDK directly.
 *
 * Object path scheme:
 *   nodes   → {basePath}/{bucket}/{iterationId}/nodes/{nodeId}/{outputId}/v{version}/{filename}
 *             (outputId defaults to 'default' for uploads that don't target a declared output)
 *   imports → {basePath}/{bucket}/{iterationId}/imports/{dataSourceId}/{timestampISO}/{filename}
 *   exports → {basePath}/{bucket}/{iterationId}/exports/{exportId}/{filename}
 *
 * `pathKind` defaults to 'nodes' for backwards-compatible behaviour.
 */
export type PathKind = 'nodes' | 'imports' | 'exports' | 'raw'

export interface SaveFileOptions {
  bucket: string
  iterationId: string
  nodeId: string
  /** Output slot id; defaults to 'default' when omitted. */
  nodeOutputId?: string
  nodeLabel: string
  filename: string
  data: Buffer
  contentType: string
  uploadType: 'AUTOMATIC' | 'MANUAL' | 'INGESTED'
  sourceInfo: string
  classification?: string // PUBLIC | INTERNAL | PARTNER | CONFIDENTIAL | RESTRICTED
  /** Structured partner attribution, resolved by FilesService.saveUpload. */
  partnerId?: string | null
  pathKind?: PathKind
  // For pathKind=imports
  dataSourceId?: string
  // For pathKind=exports
  exportId?: string
}

/**
 * Raw (unattached) file upload. No iteration/node context; stored
 * under {basePath}/{bucket}/raw/{uuid}/{filename}. attachmentKind='RAW'.
 */
export interface SaveRawFileOptions {
  bucket: string
  filename: string
  data: Buffer
  contentType: string
  classification?: string
  partnerId?: string | null
  sourceInfo: string
}

export interface StoredFile {
  id: string
  path: string
  bucket: string
  filename: string
  version: number
  contentHash: string | null
  timestamp: Date
  // Nullable for RAW files (no producing node / iteration).
  nodeSourceId: string | null
  nodeSourceLabel: string | null
  iterationId: string | null
  attachmentKind: string
  uploadType: string
  sourceInfo: string
  sizeBytes: number
  contentType: string
  classification: string
  pathKind: string
}

export interface IStorageProvider {
  save(opts: SaveFileOptions): Promise<StoredFile>
  /** Persist a raw (unattached) file. */
  saveRaw(opts: SaveRawFileOptions): Promise<StoredFile>
  getLatest(bucket: string, iterationId: string, nodeId: string, filename: string): Promise<{ path: string; version: number } | null>
  getByVersion(bucket: string, iterationId: string, nodeId: string, filename: string, version: number): Promise<string | null>
  readStream(storagePath: string): Promise<NodeJS.ReadableStream>
  delete(storagePath: string): Promise<void>
  /**
   * Write a MANIFEST.json describing all files of an iteration. Returns the storage path.
   */
  writeManifest(opts: { bucket: string; iterationId: string; manifest: object }): Promise<string>
}
