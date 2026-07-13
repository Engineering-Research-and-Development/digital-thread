import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { IStorageProvider, SaveFileOptions, SaveRawFileOptions, StoredFile, PathKind } from './storage.interface'
import { PrismaService } from '@/database/prisma.service'
import { v4 as uuidv4 } from 'uuid'

@Injectable()
export class FsStorageProvider implements IStorageProvider {
  private basePath: string

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.basePath = path.resolve(config.get<string>('storage.path') ?? './storage')
  }

  async save(opts: SaveFileOptions): Promise<StoredFile> {
    const pathKind: PathKind = opts.pathKind ?? 'nodes'
    const outputId = opts.nodeOutputId ?? 'default'
    let storagePath: string
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
      // Storage path: …/nodes/{nodeId}/{outputId}/v{version}/{filename}
      storagePath = path.join(
        this.basePath, opts.bucket, opts.iterationId, 'nodes', opts.nodeId, outputId, `v${nextVersion}`, opts.filename,
      )
    } else if (pathKind === 'imports') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const ds = opts.dataSourceId ?? 'unknown-ds'
      storagePath = path.join(
        this.basePath, opts.bucket, opts.iterationId, 'imports', ds, ts, opts.filename,
      )
    } else {
      // exports
      const exp = opts.exportId ?? uuidv4()
      storagePath = path.join(
        this.basePath, opts.bucket, opts.iterationId, 'exports', exp, opts.filename,
      )
    }

    await fs.mkdir(path.dirname(storagePath), { recursive: true })
    await fs.writeFile(storagePath, opts.data)

    const contentHash = crypto.createHash('sha256').update(opts.data).digest('hex')

    const record = await this.prisma.fileRecord.create({
      data: {
        id: uuidv4(),
        path: storagePath,
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
        partnerId: opts.partnerId ?? null,
      },
    })

    return record as StoredFile
  }

  async saveRaw(opts: SaveRawFileOptions): Promise<StoredFile> {
    const id = uuidv4()
    // Raw subtree: {basePath}/{bucket}/raw/{uuid}/{filename}
    const storagePath = path.join(this.basePath, opts.bucket, 'raw', id, opts.filename)
    await fs.mkdir(path.dirname(storagePath), { recursive: true })
    await fs.writeFile(storagePath, opts.data)
    const contentHash = crypto.createHash('sha256').update(opts.data).digest('hex')

    const record = await this.prisma.fileRecord.create({
      data: {
        id,
        path: storagePath,
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
    // Fail fast with a catchable error (→ clean 404) when the backing file is
    // missing, so a ReadStream 'error' (ENOENT) never bubbles up as an
    // UNHANDLED 'error' event and crashes the process. Demo/seed FileRecords
    // may reference storage paths that have no bytes on disk.
    try {
      await fs.access(storagePath)
    } catch {
      throw new NotFoundException('File content is not available in storage')
    }
    return fsSync.createReadStream(storagePath)
  }

  async delete(storagePath: string): Promise<void> {
    await fs.unlink(storagePath).catch(() => {})
  }

  async writeManifest(opts: { bucket: string; iterationId: string; manifest: object }): Promise<string> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const manifestPath = path.join(
      this.basePath, opts.bucket, opts.iterationId, 'exports', `manifest-${ts}`, 'MANIFEST.json',
    )
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, JSON.stringify(opts.manifest, null, 2), 'utf8')
    return manifestPath
  }
}
