import { ChevronDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type MwdFormat = 'json' | 'aasx'

interface MwdDownloadMenuProps {
  /** Performs the download for the chosen format; errors are the caller's to toast. */
  onDownload: (format: MwdFormat) => void | Promise<void>
  /** When set, the control is disabled and this short hint is shown next to it. */
  disabledReason?: string
  className?: string
}

/**
 * "Download this step as MWD" control shared by the editor's Work description
 * tab (machine-level routes) and the iteration node panel (iteration-level
 * routes). Offers the IDTA 02100 Manufacturing Work Description of one TASK
 * node as an AAS Environment JSON or as an AASX package.
 */
export function MwdDownloadMenu({ onDownload, disabledReason, className }: MwdDownloadMenuProps) {
  const disabled = Boolean(disabledReason)
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2"
            disabled={disabled}
            title={disabledReason ?? 'Download this step as an IDTA 02100 Manufacturing Work Description'}
          >
            <Download className="h-3 w-3 mr-1" aria-hidden="true" />
            Download this step as MWD
            <ChevronDown className="h-3 w-3 ml-1 opacity-70" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            IDTA 02100 · Manufacturing Work Description
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => void onDownload('json')}>
            <div className="flex flex-col">
              <span className="text-xs font-semibold">MWD (JSON)</span>
              <span className="text-[10px] text-muted-foreground">AAS v3 Environment · .mwd.json</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onDownload('aasx')}>
            <div className="flex flex-col">
              <span className="text-xs font-semibold">MWD package (AASX)</span>
              <span className="text-[10px] text-muted-foreground">Binary package · .mwd.aasx</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {disabledReason && (
        <span className="text-[9px] text-amber-500/90 truncate" role="status">{disabledReason}</span>
      )}
    </div>
  )
}
