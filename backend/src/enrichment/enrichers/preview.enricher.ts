import type { IEnricher } from '../enricher.interface'
import type { FileRecord } from '@prisma/client'

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i

/**
 * PreviewEnricher — records minimal preview metadata for images. A production
 * build would generate thumbnails via `sharp`; we keep this dep-free and
 * simply surface dimensions when they're statically inferrable from headers.
 */
export class PreviewEnricher implements IEnricher {
  readonly id = 'preview-generator'
  readonly version = '1.0.0'

  canHandle(file: FileRecord): boolean {
    return (file.contentType ?? '').startsWith('image/') || IMG_EXT.test(file.filename)
  }

  async enrich(file: FileRecord, readStream: () => Promise<NodeJS.ReadableStream>): Promise<object | null> {
    const head = await this.readFirst(readStream, 1024)
    return {
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      thumbnailAvailable: false,
      dimensions: this.extractDimensions(head, file.filename),
    }
  }

  private async readFirst(readStream: () => Promise<NodeJS.ReadableStream>, bytes: number): Promise<Buffer> {
    const stream = await readStream()
    const out: Buffer[] = []
    let total = 0
    for await (const c of stream as any) {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c)
      out.push(buf)
      total += buf.length
      if (total >= bytes) break
    }
    return Buffer.concat(out).subarray(0, bytes)
  }

  private extractDimensions(head: Buffer, filename: string): { width?: number; height?: number } | null {
    const f = filename.toLowerCase()
    // PNG: bytes 16..23 are IHDR width/height (big-endian).
    if (f.endsWith('.png') && head.length >= 24 && head[0] === 0x89 && head[1] === 0x50) {
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
    }
    return null
  }
}
