import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Download, Check } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { JsonViewer } from './json-viewer'
import type { FlowNodeDef, FlowEdgeDef, StateMachine } from '@/types/state-machine'

interface JsonPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: StateMachine
  nodes: FlowNodeDef[]
  edges: FlowEdgeDef[]
}

/**
 * Read-only preview of the state machine in the internal Digital Thread
 * representation. Shows the EXACT shape that gets persisted to the backend
 * (FlowNodeDef[] + FlowEdgeDef[] + metadata) - useful for debugging, API
 * exploration, and reviewing the impact of editor changes before saving.
 *
 * Two view modes:
 *   - Tree (collapsible JsonViewer with search) - default
 *   - Raw (plain monospace text) - for copy/paste
 */
export function JsonPreviewDialog({ open, onOpenChange, machine, nodes, edges }: JsonPreviewDialogProps) {
  const [mode, setMode] = useState<'tree' | 'raw'>('tree')
  const [copied, setCopied] = useState(false)

  // Compose the payload to mirror what the backend stores / would receive.
  // Field order is stable and human-meaningful (id/name first, big arrays last).
  const payload = useMemo(() => {
    return {
      id: machine.id,
      name: machine.name,
      version: machine.version,
      description: machine.description,
      latestVersion: machine.latestVersion ?? null,
      tags: machine.tags,
      updatedAt: machine.updatedAt,
      stats: {
        nodes: nodes.length,
        edges: edges.length,
      },
      nodes,
      edges,
    }
  }, [machine, nodes, edges])

  const rawText = useMemo(() => JSON.stringify(payload, null, 2), [payload])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawText)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed - clipboard API not available')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([rawText], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${machine.name.replace(/\s+/g, '_')}.dt.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${a.download}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1400px)] !max-w-none h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
            Internal JSON preview
            <Badge variant="outline" className="text-[10px]">{machine.name}</Badge>
            {typeof machine.latestVersion === 'number' && (
              <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-300">
                v{machine.latestVersion}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">{nodes.length} nodes</Badge>
            <Badge variant="outline" className="text-[10px]">{edges.length} edges</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setMode('tree')}
              className={`px-2.5 py-1 text-[11px] font-semibold ${
                mode === 'tree' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted/40'
              }`}
            >
              Tree
            </button>
            <button
              type="button"
              onClick={() => setMode('raw')}
              className={`px-2.5 py-1 text-[11px] font-semibold ${
                mode === 'raw' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted/40'
              }`}
            >
              Raw
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Download .dt.json
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {mode === 'tree' ? (
            <JsonViewer value={payload} className="h-full" />
          ) : (
            <pre className="h-full overflow-auto rounded-md border border-border bg-background/40 p-4 text-sm font-mono leading-relaxed">
              {rawText}
            </pre>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          This is the canonical Digital Thread representation (FlowNodeDef + FlowEdgeDef).
          Standards-compliant exports (AAS, DTDL) are available from the Export menu.
        </p>
      </DialogContent>
    </Dialog>
  )
}
