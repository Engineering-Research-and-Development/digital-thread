import { useEffect, useMemo } from 'react'

import type { PreviewViewerProps } from '@/lib/file-preview'

/**
 * PdfViewer — renders a PDF blob with the browser's built-in PDF viewer via an
 * object URL in an iframe. Zero extra dependencies; the bytes are the
 * already-authorised blob and never leave the browser. The object URL is
 * created in render (cheap) and revoked on unmount.
 */
export default function PdfViewer({ blob, filename }: PreviewViewerProps) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <iframe
      src={url}
      title={filename || 'PDF preview'}
      className="h-full w-full rounded-md border-0 bg-white"
    />
  )
}
