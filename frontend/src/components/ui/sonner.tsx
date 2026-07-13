import { Toaster as SonnerToaster, toast } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'bg-card border-border text-foreground',
        },
      }}
    />
  )
}

export { toast }
