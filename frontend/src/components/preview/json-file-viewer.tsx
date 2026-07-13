import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import type { PreviewViewerProps } from '@/lib/file-preview'
import { JsonViewer } from '@/components/editor/json-viewer'

/**
 * JsonFileViewer — parses a JSON blob and renders it with the existing
 * dependency-free `JsonViewer` (collapsible tree, search, syntax highlighting).
 * Reuses the editor viewer rather than duplicating a JSON renderer.
 */
export default function JsonFileViewer({ blob }: PreviewViewerProps) {
  const [state, setState] = useState<{ value?: unknown; error?: string }>({})

  useEffect(() => {
    let cancelled = false
    blob
      .text()
      .then((text) => {
        if (cancelled) return
        try {
          setState({ value: JSON.parse(text) })
        } catch (err) {
          setState({ error: err instanceof Error ? err.message : 'Invalid JSON' })
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [blob])

  if (state.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <span>Could not parse JSON: {state.error}</span>
      </div>
    )
  }

  if (state.value === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return <JsonViewer value={state.value} className="h-full" />
}
