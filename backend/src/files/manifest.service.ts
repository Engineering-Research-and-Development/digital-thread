import { Inject, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { IStorageProvider } from './storage/storage.interface'
import { STORAGE_PROVIDER } from './storage/storage.tokens'
import * as crypto from 'crypto'

/**
 * Iteration MANIFEST writer.
 *
 * Writes a MANIFEST.json under `{bucket}/{iterationId}/exports/manifest-<ts>/`
 * enumerating every file produced by the iteration (path, version, hash,
 * classification, upload type) plus the iteration metadata. The manifest hash
 * is persisted in `IterationManifest` for tamper detection. Signing this
 * manifest with the partner certificate is a possible future extension.
 */
@Injectable()
export class ManifestService {
  private readonly logger = new Logger(ManifestService.name)

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: IStorageProvider,
  ) {}

  async generateManifest(iterationId: string) {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { machine: true },
    })
    if (!iter) return null

    const files = await this.prisma.fileRecord.findMany({
      where: { iterationId },
      orderBy: { timestamp: 'asc' },
    })
    const events = await this.prisma.timelineEvent.findMany({
      where: { iterationId },
      orderBy: { timestamp: 'asc' },
    })

    const manifest = {
      $schema: 'urn:digital-thread:manifest:v1',
      iterationId,
      displayId: iter.displayId,
      machine: { id: iter.machineId, name: iter.machineName, version: iter.machine?.version },
      status: iter.status,
      classification: iter.classification,
      metadata: JSON.parse(iter.metadataJson || '{}'),
      generatedAt: new Date().toISOString(),
      files: files.map((f) => ({
        id: f.id,
        path: f.path,
        bucket: f.bucket,
        filename: f.filename,
        version: f.version,
        contentHash: f.contentHash,
        nodeSourceId: f.nodeSourceId,
        nodeSourceLabel: f.nodeSourceLabel,
        uploadType: f.uploadType,
        classification: f.classification,
        pathKind: f.pathKind,
        sizeBytes: f.sizeBytes,
        contentType: f.contentType,
        sourceInfo: f.sourceInfo,
        timestamp: f.timestamp.toISOString(),
      })),
      timeline: events.map((e) => ({
        timestamp: e.timestamp.toISOString(),
        nodeId: e.nodeId,
        nodeLabel: e.nodeLabel,
        partner: e.partner,
        action: e.action,
        detail: e.detail ?? null,
      })),
    }

    const manifestHash = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
    const bucket = files[0]?.bucket ?? 'iteration-manifests'
    const manifestPath = await this.storage.writeManifest({ bucket, iterationId, manifest })

    const record = await this.prisma.iterationManifest.create({
      data: { iterationId, manifestHash, manifestPath },
    })
    this.logger.log(`Manifest written for iteration ${iter.displayId} (hash=${manifestHash.slice(0, 12)}…)`)
    return record
  }

  async listForIteration(iterationId: string) {
    return this.prisma.iterationManifest.findMany({
      where: { iterationId },
      orderBy: { createdAt: 'desc' },
    })
  }
}
