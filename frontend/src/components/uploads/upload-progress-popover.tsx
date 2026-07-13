import { useUploadProgressStore } from '@/stores/upload-progress-store'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, UploadCloud, X, AlertCircle } from 'lucide-react'

/**
 * Global upload-progress widget. Fixed bottom-right mini-modal that appears
 * whenever any upload is in flight or recently finished, showing a per-file
 * progress bar. Mounted once at the app shell so it survives navigation and
 * is shared by every upload point.
 */
export function UploadProgressPopover() {
  const uploads = useUploadProgressStore((s) => s.uploads)
  const open = useUploadProgressStore((s) => s.open)
  const setOpen = useUploadProgressStore((s) => s.setOpen)
  const remove = useUploadProgressStore((s) => s.remove)
  const clearFinished = useUploadProgressStore((s) => s.clearFinished)

  if (uploads.length === 0) return null

  const active = uploads.filter((u) => u.status === 'PENDING' || u.status === 'UPLOADING').length
  const errored = uploads.filter((u) => u.status === 'ERROR').length

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-card text-card-foreground shadow-lg">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2 text-sm font-medium hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          {active > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {active > 0 ? `Uploading ${active} file${active > 1 ? 's' : ''}…` : `Uploads`}
          {errored > 0 && <span className="text-destructive">· {errored} failed</span>}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {open && (
        <>
          <div className="max-h-72 space-y-2 overflow-y-auto p-3">
            {uploads.map((u) => (
              <div key={u.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {u.status === 'COMPLETE' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />}
                    {u.status === 'ERROR' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                    {(u.status === 'PENDING' || u.status === 'UPLOADING') && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    <span className="truncate" title={u.filename}>{u.filename}</span>
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {u.status === 'ERROR' ? 'Failed' : `${u.percent}%`}
                    {(u.status === 'COMPLETE' || u.status === 'ERROR') && (
                      <button type="button" onClick={() => remove(u.id)} className="hover:text-foreground" aria-label="Dismiss">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
                <Progress
                  value={u.status === 'ERROR' ? 100 : u.percent}
                  className={u.status === 'ERROR' ? '[&>div]:bg-destructive' : undefined}
                />
                {u.context && <p className="truncate text-[10px] text-muted-foreground">{u.context}</p>}
                {u.error && <p className="text-[10px] text-destructive">{u.error}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t p-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFinished} disabled={active === uploads.length}>
              Clear finished
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
