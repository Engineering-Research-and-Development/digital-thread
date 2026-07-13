import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IStorageProvider, SaveFileOptions, SaveRawFileOptions, StoredFile, PathKind } from './storage.interface'
import { PrismaService } from '@/database/prisma.service'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'

/**
 * S3-compatible (MinIO / AWS S3) storage provider.
 *
 * Object layout mirrors the FS provider 1:1 — the same relative path
 * works on FS and MinIO:
 *   nodes   → {bucket}/{iterationId}/nodes/{nodeId}/{outputId}/v{version}/{filename}
 *   imports → {bucket}/{iterationId}/imports/{dataSourceId}/{timestampISO}/{filename}
 *   exports → {bucket}/{iterationId}/exports/{exportId}/{filename}
 *   raw     → {bucket}/raw/{uuid}/{filename}
 *
 * The logical `v{version}` segment makes every version a distinct object, so
 * correctness does NOT depend on S3 bucket versioning (we still enable it as a
 * best-effort safety net). `FileRecord.path` is stored as `{bucket}/{objectName}`.
 */
@Injectable()
export class MinioStorageProvider implements IStorageProvider {
  private client: any // Client from 'minio' package
  private ready = false
  /** Buckets we have already verified/created this process — avoids a HEAD per upload. */
  private readonly knownBuckets = new Set<string>()

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initClient()
  }

  private initClient() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('minio')
      const cfg = this.config.get('storage.minio')
      this.client = new Client({
        endPoint: cfg.endpoint,
        port: cfg.port,
        useSSL: cfg.secure,
        accessKey: cfg.accessKey,
        secretKey: cfg.secretKey,
      })
      this.ready = true
    } catch (e: any) {
      console.warn(
        `[MinIO] storage provider unavailable — is the \`minio\` package installed and are MINIO_* env vars set? (${e?.message ?? e})`,
      )
    }
  }

  private assertReady() {
    if (!this.ready) {
      throw new Error(
        'MinIO storage is not available — install the `minio` package and configure MINIO_ENDPOINT/PORT/ACCESS_KEY/SECRET_KEY.',
      )
    }
  }

  private async ensureBucket(bucket: string) {
    if (this.knownBuckets.has(bucket)) return
    const exists = await this.client.bucketExists(bucket).catch(() => false)
    if (!exists) {
      await this.client.makeBucket(bucket)
      // Bucket versioning is an extra safety net only — our logical v{version}
      // path already keeps every version. Some S3-compatible stores reject it,
      // so failures here must never block uploads.
      try {
        await this.client.setBucketVersioning(bucket, { Status: 'Enabled' })
      } catch {
        /* versioning not supported / not permitted — ignore */
      }
    }
    this.knownBuckets.add(bucket)
  }

  /** Parse a stored `{bucket}/{objectName}[?versionId=…]` path. */
  private parsePath(storagePath: string): { bucket: string; objectName: string; versionId?: string } {
    const [bucketAndObj, versionPart] = storagePath.split('?versionId=')
    const slashIdx = bucketAndObj.indexOf('/')
    return {
      bucket: bucketAndObj.substring(0, slashIdx),
      objectName: bucketAndObj.substring(slashIdx + 1),
      // Legacy records (written before the v{version} scheme) may carry a real
      // versionId here; 'undefined' is a legacy artifact and must be ignored.
      versionId: versionPart && versionPart !== 'undefined' ? versionPart : undefined,
    }
  }

  async save(opts: SaveFileOptions): Promise<StoredFile> {
    this.assertReady()

    const pathKind: PathKind = opts.pathKind ?? 'nodes'
    const outputId = opts.nodeOutputId ?? 'default'
    let objectName: string
    let nextVersion = 1

    if (pathKind === 'nodes') {
      const existing = await this.prisma.fileRecord.findMany({
        where: {
          bucket: opts.bucket,
          iterationId: opts.iterationId,
          nodeSourceId: opts.nodeId,
          nodeOutputId: opts.nodeOutputId ?? null,
          filename: opts.filename,
          pathKind: 'nodes',
        },
        orderBy: { version: 'desc' },
        take: 1,
      })
      nextVersion = existing.length > 0 ? existing[0].version + 1 : 1
      objectName = `${opts.iterationId}/nodes/${opts.nodeId}/${outputId}/v${nextVersion}/${opts.filename}`
    } else if (pathKind === 'imports') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      objectName = `${opts.iterationId}/imports/${opts.dataSourceId ?? 'unknown-ds'}/${ts}/${opts.filename}`
    } else {
      objectName = `${opts.iterationId}/exports/${opts.exportId ?? uuidv4()}/${opts.filename}`
    }

    await this.ensureBucket(opts.bucket)
    await this.client.putObject(
      opts.bucket,
      objectName,
      opts.data,
      opts.data.length,
      { 'Content-Type': opts.contentType },
    )

    const contentHash = crypto.createHash('sha256').update(opts.data).digest('hex')

    const record = await this.prisma.fileRecord.create({
      data: {
        id: uuidv4(),
        path: `${opts.bucket}/${objectName}`,
        bucket: opts.bucket,
        filename: opts.filename,
        version: nextVersion,
        contentHash,
        timestamp: new Date(),
        nodeSourceId: opts.nodeId,
        nodeOutputId: opts.nodeOutputId,
        nodeSourceLabel: opts.nodeLabel,
        iterationId: opts.iterationId,
        uploadType: opts.uploadType,
        sourceInfo: opts.sourceInfo,
        sizeBytes: opts.data.length,
        contentType: opts.contentType,
        classification: opts.classification ?? 'INTERNAL',
        pathKind,
        // Structured partner attribution. MUST be persisted
        // here too (mirrors FsStorageProvider) or Thread-Explorer scoping,
        // provenance and notification recipient resolution all break on MinIO.
        partnerId: opts.partnerId ?? null,
      },
    })

    return record as StoredFile
  }

  async saveRaw(opts: SaveRawFileOptions): Promise<StoredFile> {
    this.assertReady()
    const id = uuidv4()
    const objectName = `raw/${id}/${opts.filename}`
    await this.ensureBucket(opts.bucket)
    await this.client.putObject(
      opts.bucket, objectName, opts.data, opts.data.length, { 'Content-Type': opts.contentType },
    )
    const contentHash = crypto.createHash('sha256').update(opts.data).digest('hex')
    const record = await this.prisma.fileRecord.create({
      data: {
        id,
        path: `${opts.bucket}/${objectName}`,
        bucket: opts.bucket,
        filename: opts.filename,
        version: 1,
        contentHash,
        timestamp: new Date(),
        nodeSourceId: null,
        nodeOutputId: null,
        nodeSourceLabel: null,
        iterationId: null,
        attachmentKind: 'RAW',
        uploadType: 'MANUAL',
        sourceInfo: opts.sourceInfo,
        sizeBytes: opts.data.length,
        contentType: opts.contentType,
        classification: opts.classification ?? 'INTERNAL',
        pathKind: 'raw',
        partnerId: opts.partnerId ?? null,
      },
    })
    return record as StoredFile
  }

  async writeManifest(opts: { bucket: string; iterationId: string; manifest: object }): Promise<string> {
    this.assertReady()
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const objectName = `${opts.iterationId}/exports/manifest-${ts}/MANIFEST.json`
    await this.ensureBucket(opts.bucket)
    const body = Buffer.from(JSON.stringify(opts.manifest, null, 2), 'utf8')
    await this.client.putObject(opts.bucket, objectName, body, body.length, { 'Content-Type': 'application/json' })
    return `${opts.bucket}/${objectName}`
  }

  async getLatest(bucket: string, iterationId: string, nodeId: string, filename: string) {
    const record = await this.prisma.fileRecord.findFirst({
      where: { bucket, iterationId, nodeSourceId: nodeId, filename, pathKind: 'nodes' },
      orderBy: { version: 'desc' },
    })
    if (!record) return null
    return { path: record.path, version: record.version }
  }

  async getByVersion(bucket: string, iterationId: string, nodeId: string, filename: string, version: number) {
    const record = await this.prisma.fileRecord.findFirst({
      where: { bucket, iterationId, nodeSourceId: nodeId, filename, version, pathKind: 'nodes' },
    })
    return record?.path ?? null
  }

  async readStream(storagePath: string): Promise<NodeJS.ReadableStream> {
    this.assertReady()
    const { bucket, objectName, versionId } = this.parsePath(storagePath)
    try {
      return await this.client.getObject(bucket, objectName, versionId ? { versionId } : {})
    } catch {
      // Object missing (NoSuchKey) → clean 404, matching FsStorageProvider so a
      // demo/seed FileRecord with no backing bytes never crashes the process.
      throw new NotFoundException('File content is not available in storage')
    }
  }

  async delete(storagePath: string): Promise<void> {
    if (!this.ready) return
    const { bucket, objectName, versionId } = this.parsePath(storagePath)
    await this.client
      .removeObject(bucket, objectName, versionId ? { versionId } : {})
      .catch(() => {})
  }
}
