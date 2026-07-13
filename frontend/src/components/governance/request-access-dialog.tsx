import { useEffect, useState } from 'react'
import { Lock, Send, CheckCircle2, XCircle, Download } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  open: boolean
  filename?: string
  fileId?: string
  submitting?: boolean
  submitted?: { status: string } | null
  errorMessage?: string | null
  onSubmit: (reason: string) => void
  onClose: () => void
  /** Optional - when present, the dialog shows a "Download now" button on
   * `ALREADY_READABLE` / `APPROVED` outcomes so the user can complete the
   * action without re-clicking the original Download in the iteration UI. */
  onDownload?: (fileId: string) => void
}

/**
 * Prompts the requesting partner for a justification, then dispatches a
 * FileAccessRequest. The requesting partner sees the submission outcome
 * (PENDING / ALREADY_READABLE / EXPIRED) inline; the actual approval happens
 * in the Governance dashboard.
 */
export function RequestAccessDialog({
  open, filename, fileId, submitting, submitted, errorMessage, onSubmit, onClose, onDownload,
}: Props) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (!open) setReason('') }, [open])

  const isSubmitted = !!submitted
  const submittedStatus = submitted?.status

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-400" />
            Request file access
          </DialogTitle>
          <DialogDescription>
            You don't currently have permission to read this file. Explain
            briefly why you need it - an OWNER or SUPERADMIN will review your
            request in the Governance dashboard.
          </DialogDescription>
        </DialogHeader>

        {filename && (
          <div className="rounded-md border border-border/50 bg-muted/15 p-2.5 text-xs">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">
              File
            </div>
            <div className="font-mono break-all">{filename}</div>
            {fileId && (
              <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 break-all">
                {fileId}
              </div>
            )}
          </div>
        )}

        {isSubmitted ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              {submittedStatus === 'ALREADY_READABLE' ? (
                <>
                  <p className="font-semibold text-emerald-300">You already have access</p>
                  <p className="text-muted-foreground mt-0.5">Try the Download button again.</p>
                </>
              ) : submittedStatus === 'APPROVED' ? (
                <>
                  <p className="font-semibold text-emerald-300">Access already granted</p>
                  <p className="text-muted-foreground mt-0.5">An existing grant is still active for this file.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-emerald-300">Request submitted</p>
                  <p className="text-muted-foreground mt-0.5">
                    Status: <span className="font-mono">{submittedStatus}</span>. You'll
                    be able to read this file as soon as an OWNER/SUPERADMIN approves.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reason
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. needed to validate inspection report on the next node"
              rows={3}
              className="text-xs"
            />
          </div>
        )}

        {errorMessage && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs flex items-start gap-2">
            <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="text-rose-200">{errorMessage}</span>
          </div>
        )}

        <DialogFooter>
          {isSubmitted ? (
            <>
              {(submittedStatus === 'ALREADY_READABLE' || submittedStatus === 'APPROVED') && onDownload && fileId && (
                <Button onClick={() => { onDownload(fileId); onClose() }}>
                  <Download className="h-3 w-3 mr-1" /> Download now
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button
                onClick={() => onSubmit(reason.trim())}
                disabled={submitting || reason.trim().length < 3}
              >
                <Send className="h-3 w-3 mr-1" />
                {submitting ? 'Submitting…' : 'Submit request'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
