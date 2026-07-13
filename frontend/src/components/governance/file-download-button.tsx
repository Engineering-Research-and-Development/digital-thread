import { Download, Lock } from 'lucide-react'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { decideFileAccess, type FileAccessContext } from '@/lib/file-access'
import { FilePreviewButton } from '@/components/preview/file-preview-button'

type Props = FileAccessContext & {
  fileId: string
  filename?: string
  /** File version for the download URL. */
  version?: number
  /** Optional className for layout tweaks. */
  className?: string
  /** Visual style - colour of the download anchor. Defaults to emerald. */
  variant?: 'emerald' | 'blue' | 'muted'
  /** Compact (icon + word) vs label-only. Defaults to compact. */
  compact?: boolean
  /** Callback when the file is out-of-scope and the user clicks "Request
   * access". The caller is responsible for opening the dialog (the dialog
   * lives near the top of the surrounding screen so a single instance
   * can serve all rows). */
  onRequest: (fileId: string, filename?: string) => void
  /** Probe before opening the download URL. Use when the access decision is
   * `UNKNOWN` (cross-iteration views like lineage explorer where the partner
   * scope rules can't be evaluated locally). The caller is responsible for
   * wiring the probe + dialog via `useDownloadOrRequest`. */
  onProbe?: (fileId: string, filename?: string) => void
  /** The requester has an active (APPROVED, non-expired) governance grant for
   * this file - overrides the classification/scope decision to a direct
   * download. Lets the partner actually download a file once their access
   * request has been approved. */
  granted?: boolean
}

const COLOURS = {
  emerald: 'text-emerald-400 hover:underline',
  blue: 'text-blue-400 hover:underline',
  muted: 'text-foreground hover:underline',
} as const

/**
 * Reusable file-download button that consults `decideFileAccess` and renders
 * one of three states:
 *
 * - ALLOW   → direct `<a href={downloadUrl}>` (no extra HTTP round-trip).
 * - REQUEST → "Request access" button that opens the governance dialog
 *             via the caller-provided `onRequest`.
 * - UNKNOWN → "Download" button that goes through a backend probe via
 *             `onProbe` (which uses `useDownloadOrRequest.tryDownload`).
 *             Used for cross-iteration views where local scope evaluation
 *             is impossible.
 * - BLOCK   → not currently emitted (matrix uses REQUEST for partner-blocked).
 *
 * Every file download in the app goes through this component, so changes to
 * the matrix or the governance flow only have to happen in one place.
 */
export function FileDownloadButton({
  fileId,
  filename,
  version,
  className,
  variant = 'emerald',
  compact = true,
  onRequest,
  onProbe,
  granted,
  ...ctx
}: Props) {
  const decision = decideFileAccess(ctx)

  // An approved governance grant (or a plain ALLOW) → direct download anchor,
  // plus an in-browser preview for CAD/mesh, PDF and JSON files
  // (FilePreviewButton renders nothing for non-previewable types). The preview
  // is gated by reuse: it only appears here, where the file is already
  // downloadable for this user.
  if (decision === 'ALLOW' || granted) {
    return (
      <span className={cn('inline-flex items-center gap-2 shrink-0', className)}>
        <a
          href={api.files.downloadUrl(fileId, version)}
          target="_blank"
          rel="noreferrer"
          className={cn('inline-flex items-center gap-0.5', COLOURS[variant])}
          title={granted && decision !== 'ALLOW' ? 'Access granted by governance - download' : 'Download'}
        >
          <Download className="h-3 w-3" />
          {compact ? 'Download' : 'Download file'}
        </a>
        <FilePreviewButton fileId={fileId} filename={filename} version={version} />
      </span>
    )
  }

  if (decision === 'REQUEST') {
    // Probe-FIRST: a file with an active grant must download. The backend
    // assertReadable honours the grant, so probing returns 200 → download; only
    // a real 403 falls back to the request dialog (via the probe's handler).
    // This is what fixes "approved but still shows Request access". When no
    // probe is wired, open the dialog directly.
    return (
      <button
        type="button"
        onClick={() => (onProbe ? onProbe(fileId, filename) : onRequest(fileId, filename))}
        className={cn(
          'inline-flex items-center gap-0.5 text-amber-400/90 hover:text-amber-300 hover:underline shrink-0',
          className,
        )}
        title="Out of scope - download if you have a grant, otherwise request access from governance"
      >
        <Lock className="h-3 w-3" />
        Request access
      </button>
    )
  }

  // UNKNOWN - defer to backend probe via onProbe (falls back to dialog on 403).
  return (
    <button
      type="button"
      onClick={() => onProbe?.(fileId, filename)}
      className={cn('inline-flex items-center gap-0.5 shrink-0', COLOURS[variant], className)}
      title="Download (governance will be consulted if needed)"
      disabled={!onProbe}
    >
      <Download className="h-3 w-3" />
      {compact ? 'Download' : 'Download file'}
    </button>
  )
}
