import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { NodeCategory, NodeStatus } from '@/types/enums'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/data/node-catalog'
import { cn } from '@/lib/utils'

interface CanvasLegendProps {
  mode: 'editor' | 'iteration'
  className?: string
}

const STATUS_LEGEND: Array<{ status: NodeStatus; label: string; color: string; ring: string }> = [
  { status: NodeStatus.IDLE, label: 'Waiting', color: 'bg-gray-500', ring: 'ring-gray-500/40' },
  { status: NodeStatus.PENDING, label: 'Your turn', color: 'bg-amber-400', ring: 'ring-amber-500/40' },
  { status: NodeStatus.RUNNING, label: 'Processing', color: 'bg-blue-500', ring: 'ring-blue-500/40' },
  { status: NodeStatus.COMPLETED, label: 'Completed', color: 'bg-emerald-500', ring: 'ring-emerald-500/40' },
  { status: NodeStatus.ERROR, label: 'Error', color: 'bg-red-500', ring: 'ring-red-500/40' },
]

export function CanvasLegend({ mode, className }: CanvasLegendProps) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={cn(
        'absolute top-3 right-3 z-10 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-md',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-foreground w-full"
        aria-expanded={open}
        aria-controls="canvas-legend-body"
      >
        <Info className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        Legend
        {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </button>
      {open && (
        <div id="canvas-legend-body" className="px-3 pb-2.5 space-y-2.5 border-t border-border/60 pt-2">
          <LegendSection title="Node categories">
            {(Object.keys(CATEGORY_COLORS) as NodeCategory[]).map((cat) => (
              <div key={cat} className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                  aria-hidden="true"
                />
                <span className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
              </div>
            ))}
          </LegendSection>

          {mode === 'iteration' && (
            <LegendSection title="Node status">
              {STATUS_LEGEND.map((s) => (
                <div key={s.status} className="flex items-center gap-2">
                  <span className={cn('inline-block h-2.5 w-2.5 rounded-full', s.color)} aria-hidden="true" />
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </LegendSection>
          )}
        </div>
      )}
    </div>
  )
}

function LegendSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">{children}</div>
    </div>
  )
}
