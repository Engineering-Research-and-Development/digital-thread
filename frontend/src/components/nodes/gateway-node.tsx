import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { NodeStatus, NodeCategory, NodeKind } from '@/types/enums'
import { getPartnerColor } from '@/lib/partner-utils'
import { nodeColor } from '@/data/node-catalog'
import { cn } from '@/lib/utils'
import { ShieldCheck, GitMerge } from 'lucide-react'
import type { BaseNodeData } from '@/types/nodes'

const statusDotStyles: Record<NodeStatus, string> = {
  [NodeStatus.IDLE]: 'bg-gray-500',
  [NodeStatus.PENDING]: 'bg-amber-400 animate-pulse',
  [NodeStatus.RUNNING]: 'bg-blue-500 animate-pulse',
  [NodeStatus.COMPLETED]: 'bg-emerald-500',
  [NodeStatus.ERROR]: 'bg-red-500',
  [NodeStatus.SKIPPED]: 'bg-gray-600',
}

const statusBgStyles: Record<NodeStatus, string> = {
  [NodeStatus.IDLE]: 'bg-card',
  [NodeStatus.PENDING]: 'bg-amber-500/10',
  [NodeStatus.RUNNING]: 'bg-blue-500/10 node-running',
  [NodeStatus.COMPLETED]: 'bg-emerald-500/10',
  [NodeStatus.ERROR]: 'bg-red-500/10',
  [NodeStatus.SKIPPED]: 'bg-card opacity-60',
}

function GatewayNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData
  const status = d.status || NodeStatus.IDLE
  const isQualityGate = d.nodeTypeId === 'QUALITY_GATE'
  const Icon = isQualityGate ? ShieldCheck : GitMerge
  const partnerColor = d.responsiblePartner ? getPartnerColor(d.responsiblePartner) : undefined
  // Gateway border/icon use the canonical palette colour. Falls back to
  // KIND_COLORS[GATEWAY] when no explicit override is set.
  const color = nodeColor({ color: d.color, kind: d.kind ?? NodeKind.GATEWAY, category: d.category ?? NodeCategory.GATEWAY })

  return (
    <div className="relative flex flex-col items-center" style={{ width: 140 }}>
      {/* Partner badge above diamond */}
      {d.responsiblePartner && (
        <div
          className="mb-1 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-center"
          style={{ backgroundColor: `${partnerColor}20`, color: partnerColor }}
        >
          {d.responsiblePartner}
        </div>
      )}

      <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-slate-500 !border-slate-400"
          style={{ top: -6 }}
        />

        <div
          className={cn(
            'w-[85px] h-[85px] rotate-45 border-2 rounded-md shadow-md transition-all',
            statusBgStyles[status],
            selected && 'ring-2 ring-blue-500',
          )}
          style={{ borderColor: color }}
        >
          <div className="-rotate-45 flex flex-col items-center justify-center h-full gap-1">
            <Icon className="h-4 w-4" style={{ color }} />
            <span className="text-[9px] font-semibold text-center leading-tight">{d.label}</span>
            <div className={cn('h-2 w-2 rounded-full', statusDotStyles[status])} />
          </div>
        </div>

        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-slate-500 !border-slate-400"
          style={{ bottom: -6 }}
        />
      </div>
    </div>
  )
}

export const GatewayNode = memo(GatewayNodeComponent)
