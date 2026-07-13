import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { FileRecord } from '@/types/minio'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, Layers, Loader2 } from 'lucide-react'

/**
 * Reusable existing-file picker. Lets a user pick a file already in the
 * system - either a RAW (unattached / "fresh") upload or a file produced by
 * a previous iteration - instead of uploading a new one. Returns the selected
 * FileRecord via `onSelect`. `fileTypes` (extensions, e.g. ['.step']) optionally
 * filters the list to what the target node input accepts.
 */
type Scope = 'ALL' | 'RAW' | 'NODE'

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function FilePickerModal({
  open,
  onOpenChange,
  onSelect,
  fileTypes,
  title = 'Select an existing file',
  description = 'Pick a fresh (unattached) file or one produced by a previous iteration.',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (file: FileRecord) => void
  fileTypes?: string[]
  title?: string
  description?: string
}) {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<Scope>('ALL')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    api.files
      .list(undefined, undefined, scope)
      .then((res: any) => {
        if (cancelled) return
        setFiles(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [])
      })
      .catch(() => !cancelled && setFiles([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, scope])

  const accepted = useMemo(
    () => (fileTypes ?? []).map((t) => (t.startsWith('.') ? t : `.${t}`).toLowerCase()),
    [fileTypes],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return files.filter((f) => {
      if (accepted.length && !accepted.includes(extOf(f.filename))) return false
      if (q && !f.filename.toLowerCase().includes(q)) return false
      return true
    })
  }, [files, search, accepted])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search by filename…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <div className="flex rounded-md border p-0.5 text-xs">
            {(['ALL', 'RAW', 'NODE'] as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`rounded px-2 py-1 ${scope === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {s === 'ALL' ? 'All' : s === 'RAW' ? 'Fresh' : 'From iterations'}
              </button>
            ))}
          </div>
        </div>

        {accepted.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Filtered to: {accepted.join(', ')}
          </p>
        )}

        <ScrollArea className="h-80 rounded-md border">
          {loading ? (
            <div className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading files…
            </div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No matching files.</div>
          ) : (
            <ul className="divide-y">
              {visible.map((f) => {
                const isRaw = f.attachmentKind === 'RAW' || !f.iterationId
                return (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/40">
                    <div className="flex min-w-0 items-center gap-2">
                      {isRaw ? (
                        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium" title={f.filename}>{f.filename}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{formatBytes(f.sizeBytes)}</span>
                          {f.classification && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{f.classification}</Badge>}
                          <span>· {isRaw ? 'Fresh (unattached)' : (f.nodeSourceLabel || 'Iteration file')}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 text-xs"
                      onClick={() => {
                        onSelect(f)
                        onOpenChange(false)
                      }}
                    >
                      Select
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
