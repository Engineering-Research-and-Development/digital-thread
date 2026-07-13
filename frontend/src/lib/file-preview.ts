/**
 * File preview dispatch — maps a filename to the in-browser
 * viewer kind that can render it, and the shared props every viewer takes.
 *
 * Every previewer follows the same contract: it is mounted only where the file
 * is already downloadable (see `FileDownloadButton`), receives the
 * already-authorised blob (fetched once by `FilePreviewDialog` through the
 * governance-gated download route), and renders 100% locally. Adding a new
 * format = add a `kind` here + a lazy viewer in the dialog's dispatch.
 */
import { isPreviewable3D } from './model-formats'

export type PreviewKind = '3d' | 'pdf' | 'json'

/** Props shared by every preview viewer component. */
export type PreviewViewerProps = {
  blob: Blob
  filename: string
}

function extensionOf(filename?: string | null): string | null {
  if (!filename) return null
  const match = /\.([a-z0-9]+)\s*$/i.exec(filename.trim())
  return match?.[1]?.toLowerCase() ?? null
}

/** The preview kind for `filename`, or null if no viewer handles it. */
export function previewKindFor(filename?: string | null): PreviewKind | null {
  if (isPreviewable3D(filename)) return '3d'
  const ext = extensionOf(filename)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'json') return 'json'
  return null
}

export function isPreviewable(filename?: string | null): boolean {
  return previewKindFor(filename) !== null
}
