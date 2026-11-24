import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const handleCancel = () => {
    pending?.resolve(false)
    setPending(null)
  }

  const handleConfirm = () => {
    pending?.resolve(true)
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) handleCancel() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {pending?.destructive && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              )}
              <DialogTitle className="min-w-0">{pending?.title}</DialogTitle>
            </div>
            {pending?.description && (
              <DialogDescription className="pt-1">{pending.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {pending?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={pending?.destructive ? 'destructive' : 'default'}
              onClick={handleConfirm}
              autoFocus
            >
              {pending?.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

/**
 * Confirm title of the form `<prefix> "<name>"?` on a single line, where only
 * the name is truncated with an ellipsis when it does not fit.
 */
export function ConfirmTitleWithName({ prefix, name }: { prefix: string; name: string }) {
  return (
    <span className="flex min-w-0 whitespace-nowrap" title={name}>
      <span className="shrink-0">{prefix} "</span>
      <span className="min-w-0 truncate">{name}</span>
      <span className="shrink-0">"?</span>
    </span>
  )
}
