import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Circle, Upload, Eye, ArrowRight, Sparkles } from 'lucide-react'
import { NodeStatus } from '@/types/enums'
import type { FlowNodeDef, NodeRuntimeState } from '@/types/state-machine'
import { normalizeFlowNode } from '@/lib/normalize-node'
import { cn } from '@/lib/utils'

interface GuidedActionsProps {
  node: FlowNodeDef
  nodeState: NodeRuntimeState | null
  iterationId: string
  /** Legacy: a flat map of {predecessorNodeId → outputFilePath?}. Kept for back-compat. */
  predecessorOutputs: Record<string, string | undefined>
  onUploadInput: (inputId: string, inputLabel: string) => void
  onCompleteNode: () => void
}

interface ActionItem {
  id: string
  label: string
  type: 'upload-input' | 'verify-predecessor' | 'upload-output'
  completed: boolean
  inputDefId?: string
  required: boolean
}

/**
 * Guided actions for a partner-driven node. A node is described by its
 * inputs[] + outputs[] contract. This component renders a checklist derived
 * from that contract:
 *   - PREDECESSOR inputs become "verify" items (files arrive from upstream).
 *   - MANUAL / DATASOURCE inputs become "upload-input" items.
 *   - Each declared output becomes an "upload-output" item.
 * The Complete CTA unlocks only when every required item is satisfied.
 */
export function GuidedActions({
  node,
  nodeState,
  predecessorOutputs,
  onUploadInput,
  onCompleteNode,
}: GuidedActionsProps) {
  const normalized = useMemo(() => normalizeFlowNode(node), [node])
  const status = nodeState?.status || NodeStatus.IDLE
  const inputs = normalized.inputs ?? []
  const outputs = normalized.outputs ?? []
  const inputStatuses = nodeState?.inputFileStatuses || {}
  const recordedOutputs = nodeState?.outputs ?? {}

  if (status !== NodeStatus.PENDING && status !== NodeStatus.RUNNING) return null

  const actions: ActionItem[] = []

  for (const inp of inputs) {
    const provided =
      inputStatuses[inp.id]?.provided === true ||
      (inputStatuses[inp.id]?.fileIds?.length ?? 0) > 0
    // After normalizeFlowNode, source is always the canonical object form.
    const srcKind = typeof inp.source === 'string' ? inp.source : (inp.source?.kind ?? 'MANUAL')
    if (srcKind === 'PREDECESSOR') {
      const hasOutput =
        provided || Object.values(predecessorOutputs).some((p) => !!p)
      actions.push({
        id: `in-${inp.id}`,
        label: `Receive "${inp.name ?? inp.label ?? inp.id}" from predecessor`,
        type: 'verify-predecessor',
        completed: hasOutput,
        inputDefId: inp.id,
        required: Boolean(inp.required),
      })
    } else {
      actions.push({
        id: `in-${inp.id}`,
        label: `Upload "${inp.name ?? inp.label ?? inp.id}"`,
        type: 'upload-input',
        completed: provided,
        inputDefId: inp.id,
        required: Boolean(inp.required),
      })
    }
  }

  for (const out of outputs) {
    const filled = (recordedOutputs[out.id]?.length ?? 0) > 0
    // Legacy fallback - the implicit `default` slot can be satisfied by the
    // legacy outputFilePath when it's set.
    const legacyDefault =
      out.id === 'default' && Boolean(nodeState?.outputFilePath)
    actions.push({
      id: `out-${out.id}`,
      label: `Upload output "${out.name ?? out.label ?? out.id}"`,
      type: 'upload-output',
      completed: filled || legacyDefault,
      inputDefId: out.id, // reused: caller uses this to identify the output slot
      required: Boolean(out.required),
    })
  }

  if (actions.length === 0) return null

  const requiredOpen = actions.filter((a) => a.required && !a.completed).length
  const allRequiredDone = requiredOpen === 0

  const completedCount = actions.filter((a) => a.completed).length
  const totalCount = actions.length
  const percent = totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100)

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span className="text-xs font-semibold">Required actions</span>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {completedCount}/{totalCount} completed
          </span>
        </div>
        <Progress value={percent} className="h-1.5" aria-label={`${percent}% of actions completed`} />
      </div>

      <ul className="space-y-1.5" role="list">
        {actions.map((action) => (
          <li
            key={action.id}
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] transition-colors border',
              action.completed
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : action.required
                ? 'bg-amber-500/5 text-foreground border-amber-500/20'
                : 'bg-muted/20 text-foreground/80 border-border/50',
            )}
          >
            {action.completed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            ) : (
              <Circle className={cn('h-4 w-4 shrink-0', action.required ? 'text-amber-400' : 'text-muted-foreground')} aria-hidden="true" />
            )}

            <span className="flex-1 leading-tight">
              {action.label}
              {action.required && !action.completed && (
                <span className="ml-1 text-[9px] text-amber-400 font-semibold uppercase tracking-wide">required</span>
              )}
            </span>

            {!action.completed && action.type === 'upload-input' && action.inputDefId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 shrink-0"
                onClick={() => onUploadInput(action.inputDefId!, action.label)}
              >
                <Upload className="h-3 w-3 mr-1" aria-hidden="true" />
                Upload
              </Button>
            )}

            {!action.completed && action.type === 'verify-predecessor' && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0" title="Waiting for predecessor output">
                <Eye className="h-3 w-3" aria-hidden="true" />
                Waiting
              </span>
            )}

            {action.type === 'upload-output' && (
              <span
                className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0"
                title="Use the Outputs section above to upload"
              >
                {action.completed ? '✓' : '↑ Outputs section'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {(() => {
        // The node must be claimed (RUNNING) before it can be completed -
        // mirrors the invariant enforced by IterationsService.completeNode.
        const notClaimedYet = status !== NodeStatus.RUNNING
        const completeDisabled = notClaimedYet || !allRequiredDone
        const completeLabel = notClaimedYet
          ? 'Claim the node first'
          : allRequiredDone
            ? 'Complete & unlock next'
            : `Complete (${requiredOpen} required left)`
        const completeTitle = notClaimedYet
          ? 'You must claim this node before completing it.'
          : allRequiredDone
            ? 'Mark node as complete'
            : 'Complete all required actions first'
        return (
          <Button
            size="sm"
            className={cn(
              'w-full',
              !completeDisabled && 'bg-emerald-500 hover:bg-emerald-600 text-black font-bold',
            )}
            disabled={completeDisabled}
            onClick={onCompleteNode}
            title={completeTitle}
          >
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            {completeLabel}
          </Button>
        )
      })()}
    </div>
  )
}
