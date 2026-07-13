import { Eye } from 'lucide-react'

import { cn } from '@/lib/utils'
import { previewKindFor } from '@/lib/file-preview'

type Props = {
  fileId: string
  filename?: string
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
export function FilePreviewButton({ filename, className }: Props) {
  const kind = previewKindFor(filename)

  if (!kind) return null

  return (
    <span
      inert
      aria-hidden="true"
      title="Preview — work in progress"
      className={cn(
        'inline-flex items-center gap-0.5 text-sky-400 shrink-0 select-none cursor-not-allowed blur-[1.5px] opacity-60',
        className,
      )}
    >
      <Eye className="h-3 w-3" />
      Preview
    </span>
  )
}
