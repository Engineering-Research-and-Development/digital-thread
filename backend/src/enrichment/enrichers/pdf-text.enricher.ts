import type { IEnricher } from '../enricher.interface'
import type { FileRecord } from '@prisma/client'

/**
 * PDF text extractor — minimal heuristic reference enricher.
 * Extracts ASCII text between `BT`/`ET` markers and detects common aerospace
 * material / standard mentions. A production build would use `pdf-parse` or
 * `pdfjs-dist`; we keep the footprint dep-free.
 */
export class PdfTextEnricher implements IEnricher {
  readonly id = 'pdf-text-extractor'
  readonly version = '1.0.0'

  canHandle(file: FileRecord): boolean {
    return file.contentType === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf')
  }

  async enrich(_file: FileRecord, readStream: () => Promise<NodeJS.ReadableStream>): Promise<object | null> {
    const chunks: Buffer[] = []
    const stream = await readStream()
    for await (const c of stream as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    const raw = Buffer.concat(chunks).toString('latin1')

    // Naive text extraction between BT/ET markers.
    const textMatches = raw.match(/BT\s([\s\S]*?)\sET/g) ?? []
    const text = textMatches
      .map((m) => m.replace(/Tj|TJ|Tf|Td|Tm|\[|\]|\(|\)/g, ' ').replace(/\s+/g, ' ').trim())
      .join(' ')
      .slice(0, 4096)

    const materials = [...new Set(text.match(/\b(?:AS4\/3501-6|IM7\/977-3|T700\/PAEK|PEEK|PEKK|PAEK)\b/gi) ?? [])]
    const standards = [...new Set(text.match(/\b(?:AS9100D?|ASTM\s+D\d+|ISO\s+\d+|EASA|FAA)\b/gi) ?? [])]
    const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length

    return {
      text,
      textLength: text.length,
      pageCount,
      materials,
      standards,
    }
  }
}
