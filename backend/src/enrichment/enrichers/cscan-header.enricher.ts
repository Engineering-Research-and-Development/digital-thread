import type { IEnricher } from '../enricher.interface'
import type { FileRecord } from '@prisma/client'

/**
 * CScanHeaderEnricher — extracts the header block from NDI C-scan binary files
 * (common in composite inspection workflows). Recognises a minimal set of
 * ASCII-delimited headers seen on vendor files; unrecognised formats are
 * logged but do not error.
 */
export class CScanHeaderEnricher implements IEnricher {
  readonly id = 'cscan-header-extractor'
  readonly version = '1.0.0'

  canHandle(file: FileRecord): boolean {
    const n = file.filename.toLowerCase()
    return n.endsWith('.cscan') || n.endsWith('.raw') || n.endsWith('.dicom')
  }

  async enrich(file: FileRecord, readStream: () => Promise<NodeJS.ReadableStream>): Promise<object | null> {
    const header = await this.readHeader(readStream, 2048)
    const ascii = header.toString('ascii').replace(/\0+/g, ' ')

    const kv: Record<string, string> = {}
    for (const m of ascii.matchAll(/([A-Z_][A-Z0-9_]{2,32})\s*[:=]\s*([^\r\n]{1,64})/g)) {
      kv[m[1].toUpperCase()] = m[2].trim()
    }

    return {
      filename: file.filename,
      detectedKeys: Object.keys(kv),
      header: kv,
      sizeBytes: file.sizeBytes,
    }
  }

  private async readHeader(readStream: () => Promise<NodeJS.ReadableStream>, bytes: number): Promise<Buffer> {
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
}
