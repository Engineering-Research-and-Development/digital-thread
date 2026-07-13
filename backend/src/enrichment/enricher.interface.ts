import type { FileRecord } from '@prisma/client'

/**
 * IEnricher — plugin contract for post-ingest metadata extractors.
 *
 * Enrichers subscribe to new FileRecord rows (via `EnrichmentDispatcher.dispatch`)
 * and produce one `EnrichmentRecord` per (fileId, enricherId, enricherVersion).
 */
export interface IEnricher {
  readonly id: string
  readonly version: string
  /** Fast pre-check — called synchronously. Return true iff this enricher wants to run. */
  canHandle(file: FileRecord): boolean
  /** Actual enrichment. Return `null` to skip silently. Throw to mark ERROR. */
  enrich(file: FileRecord, readStream: () => Promise<NodeJS.ReadableStream>): Promise<object | null>
}
