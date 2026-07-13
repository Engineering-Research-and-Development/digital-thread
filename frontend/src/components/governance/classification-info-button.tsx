import { useState } from 'react'
import { Info } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const LEVELS: Array<{
  level: string
  color: string
  who: string
  examples: string
}> = [
  {
    level: 'PUBLIC',
    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    who: 'Any authenticated user of the platform.',
    examples: 'Marketing material, published datasheets, recycling plans.',
  },
  {
    level: 'INTERNAL',
    color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    who: 'Any consortium partner (default level).',
    examples: 'General specs, public-facing datasheets, methodology notes.',
  },
  {
    level: 'PARTNER',
    color: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
    who:
      'SUPERADMIN / OWNER, plus the partner that owns the node and any partner that consumes the file as a declared input (need-to-know).',
    examples: 'CAD release, material card, as-built data, inspection reports.',
  },
  {
    level: 'CONFIDENTIAL',
    color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    who: 'SUPERADMIN and OWNER only. Partners are blocked.',
    examples: 'Process logs, raw scans, defect maps, internal cost data.',
  },
  {
    level: 'RESTRICTED',
    color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    who: 'SUPERADMIN and OWNER only (highest restriction). Often subject to legal/export controls.',
    examples: 'Trade secrets, export-controlled artefacts, regulator-only data.',
  },
]

type Props = {
  className?: string
  /** Optional accessible label; defaults to "Show classification levels". */
  ariaLabel?: string
}

/**
 * Inline info button that opens a modal explaining the 5-level file
 * classification scheme used across the platform.
 *
 * Used both in the state-machine editor (defining the default level for an
 * output slot) and in the iteration runtime (operator overriding the level
 * at upload time). The scheme is an adaptation rooted in
 * ISO/IEC 27001:2022 Annex A.5.12 (Information Classification), extended
 * with a PARTNER tier for multi-stakeholder supply chains.
 */
export function ClassificationInfoButton({ className, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label={ariaLabel ?? 'Show classification levels'}
        title="What do these classification levels mean?"
        className={cn(
          'inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors',
          className,
        )}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>File classification levels</DialogTitle>
            <DialogDescription>
              How each level gates download / view access at runtime, with
              examples taken from typical industrial workflows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {LEVELS.map((l) => (
              <div
                key={l.level}
                className="rounded-md border border-border/50 bg-muted/10 p-3"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase',
                      l.color,
                    )}
                  >
                    {l.level}
                  </span>
                </div>
                <p className="text-xs text-foreground/90">
                  <span className="font-semibold">Who can read it:</span>{' '}
                  {l.who}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="font-semibold">Typical content:</span>{' '}
                  {l.examples}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-border/50 bg-muted/10 p-3 mt-2 text-[11px] text-muted-foreground space-y-1.5">
            <p>
              <span className="font-semibold text-foreground">Standards &amp; sources.</span>{' '}
              The four core tiers (Public, Internal, Confidential, Restricted)
              follow the information-classification practice of{' '}
              <span className="font-mono">ISO/IEC 27001:2022</span> Annex
              A.5.12 and align with the public/internal/restricted/confidential
              ladder used by most enterprise information-security policies.
            </p>
            <p>
              The <span className="font-mono">PARTNER</span> tier is a
              project consortium adaptation for multi-stakeholder supply
              chains - it formalises the "need-to-know" principle of{' '}
              <span className="font-mono">ISO/IEC 27002</span> §5.10 by making
              access derive from the workflow graph itself (own node OR
              consumed-as-input).
            </p>
            <p>
              The colour-coding follows the spirit of{' '}
              <span className="font-mono">TLP 2.0</span> (Traffic Light
              Protocol, FIRST.org) - green / amber / red carry the same
              "increasing restriction" intuition.
            </p>
            <p>
              For industrial-security levels on the OT side (e.g. machine
              isolation, network segmentation) the platform separately uses{' '}
              <span className="font-mono">IEC 62443</span> SL 1–4.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
