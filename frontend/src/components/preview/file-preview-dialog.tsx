import { lazy, Suspense, useEffect, useState } from 'react'
import { AlertTriangle, Box, FileJson, FileText, Loader2 } from 'lucide-react'

import { api } from '@/lib/api'
import type { PreviewKind } from '@/lib/file-preview'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Each viewer is its own chunk, fetched the first time a file of that kind is
// previewed. The 3D viewer pulls in three.js + the OpenCASCADE WASM; PDF/JSON
// are light. The dialog fetches the authorised bytes once and dispatches.
const Model3DViewer = lazy(() => import('./model-3d-viewer'))
const PdfViewer = lazy(() => import('./pdf-viewer'))
const JsonFileViewer = lazy(() => import('./json-file-viewer'))

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: PreviewKind
  fileId: string
  filename: string
  /** File version for the gated download route. */
  version?: number
}

const TITLE: Record<PreviewKind, { label: string; icon: typeof Box }> = {
  '3d': { label: '3D preview', icon: Box },
  pdf: { label: 'PDF preview', icon: FileText },
  json: { label: 'JSON preview', icon: FileJson },
}

const NOTE: Record<PreviewKind, string> = {
  '3d': 'Drag to orbit, scroll to zoom. Tessellated preview — not a substitute for the source CAD.',
  pdf: 'Rendered with your browser’s built-in PDF viewer.',
  json: 'Collapsible tree with key/value search.',
}

/**
 * FilePreviewDialog — fetches the authorised file bytes through the same
 * governance-gated download route (`assertReadable` runs server-side) and
 * renders them locally with the viewer for `kind`. The source file is never
 * re-served unprotected: only users who can already download it see a preview.
 */
export function FilePreviewDialog({ open, onOpenChange, kind, fileId, filename, version }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The dialog is mounted only while open (see FilePreviewButton), so state
  // starts fresh on mount. Fetch once; setState happens in async callbacks only.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.files
      .fetchBlob(fileId, version)
      .then((b) => {
        if (!cancelled) setBlob(b)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [open, fileId, version])

  const { label, icon: Icon } = TITLE[kind]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[min(96vw,1200px)] flex-col !max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" /> {label}
          </DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">{filename}</DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-[#0b0f17]">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <span>{error}</span>
            </div>
          ) : !blob ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Fetching file…</span>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              }
            >
              {kind === '3d' && <Model3DViewer blob={blob} filename={filename} />}
              {kind === 'pdf' && <PdfViewer blob={blob} filename={filename} />}
              {kind === 'json' && <JsonFileViewer blob={blob} filename={filename} />}
            </Suspense>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Rendered locally in your browser — the file is not sent to any third-party service. {NOTE[kind]}
        </p>
      </DialogContent>
    </Dialog>
  )
}
