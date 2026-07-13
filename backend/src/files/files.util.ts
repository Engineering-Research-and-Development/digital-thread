import { BadRequestException } from '@nestjs/common'
import * as path from 'path'

/**
 * File extensions rejected on upload — executable / script content that has no
 * place in an engineering-data exchange and is a malware vector.
 */
export const BLOCKED_UPLOAD_EXTENSIONS = new Set<string>([
  '.exe', '.bat', '.cmd', '.com', '.cpl', '.dll', '.msi', '.scr',
  '.sh', '.ps1', '.psm1', '.vbs', '.vbe', '.jse', '.wsf', '.wsh',
])

/**
 * Sanitize an uploaded filename. Strips any directory component (defends
 * against path traversal — `../`, absolute paths, drive letters), removes
 * control and filesystem-illegal characters, and rejects empty / dot names.
 * Throws BadRequestException when the input cannot yield a safe name.
 */
export function sanitizeFilename(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new BadRequestException('filename is required')
  }
  // Normalise separators and keep only the basename — drops ../, /x, C:\x.
  let name = path.posix.basename(raw.replace(/\\/g, '/').trim())
  // Drop control chars and characters illegal on common filesystems.
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\x00-\x1f<>:"/\\|?*]/g, '')
  // No leading dots or whitespace (no hidden / relative names).
  name = name.replace(/^[.\s]+/, '').trim()
  if (name.length === 0 || name === '.' || name === '..') {
    throw new BadRequestException('filename is invalid')
  }
  // Bound the length (filesystem limits + DB column safety).
  if (name.length > 200) {
    const ext = path.posix.extname(name).slice(0, 20)
    name = name.slice(0, 200 - ext.length) + ext
  }
  return name
}

/** Throw when a (sanitized) filename carries a blocked executable extension. */
export function assertAllowedExtension(filename: string): void {
  const ext = path.posix.extname(filename).toLowerCase()
  if (BLOCKED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new BadRequestException(`File type "${ext}" is not allowed`)
  }
}

/**
 * Whitelist gate. Throws when the file's extension does not appear in
 * the declared `accepted` list. Empty/missing whitelist means "accept anything"
 * (the node author left the output unconstrained). Extensions are matched
 * case-insensitively and the leading dot is normalised.
 */
export function assertAcceptedExtension(filename: string, accepted: readonly string[] | undefined | null): void {
  if (!accepted || accepted.length === 0) return
  const ext = path.posix.extname(filename).toLowerCase()
  const normalised = accepted.map((e) => {
    const v = String(e).trim().toLowerCase()
    return v.startsWith('.') ? v : `.${v}`
  })
  if (!normalised.includes(ext)) {
    throw new BadRequestException(
      `File extension "${ext}" is not in the accepted list (${normalised.join(', ')})`,
    )
  }
}
