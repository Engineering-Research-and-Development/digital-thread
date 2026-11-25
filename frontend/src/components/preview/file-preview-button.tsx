import { Eye } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { previewKindFor } from '@/lib/file-preview'
import { FilePreviewDialog } from './file-preview-dialog'

type Props = {
  fileId: string
  filename: string
  version?: number
  className?: string
}

/**
 * FilePreviewButton — a compact "Preview" action that opens an in-browser
 * viewer for CAD/mesh (3D), PDF and JSON files. Renders nothing for
 * non-previewable extensions, so it is safe to drop next to any file row. It is
 * mounted only where the file is already downloadable (see `FileDownloadButton`),
 * so it inherits the same governance gate without re-implementing it.
 *
 * WORK IN PROGRESS: in-browser preview is temporarily hidden. We keep the
 * affordance visible where a preview would appear, but blurred + inert so it
 * reads as "coming soon". To restore, revert this file to the interactive
 * version (button + `FilePreviewDialog` opened via local `open` state).
 */
export function FilePreviewButton({fileId, filename, version, className,}: Props) {
  const [open, setOpen] = useState(false)
  const kind = previewKindFor(filename)

  if (!kind) return null

return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Preview"
        aria-label={
          filename ? `Open preview for ${filename}` : 'Open file preview'
        }
        className={cn(
          'inline-flex items-center gap-0.5 text-sky-400 shrink-0 cursor-pointer',
          'hover:text-sky-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
          className,
        )}
      >
        <Eye className="h-3 w-3" aria-hidden="true" />
        Preview
      </button>

      {open && (
        <FilePreviewDialog
          open={open}
          onOpenChange={setOpen}
          kind={kind}
          fileId={fileId}
          filename={filename}
          version={version}
        />
      )}
    </>
  )
}
