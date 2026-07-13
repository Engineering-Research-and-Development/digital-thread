import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeCategory, NodeStatus } from '@/types/enums'
import { NodeWrapper } from './node-wrapper'
import { Progress } from '@/components/ui/progress'
import type { AutomaticNodeData } from '@/types/nodes'
import { NODE_CATALOG_MAP } from '@/data/node-catalog'

function AutomaticNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as AutomaticNodeData
  const catalog = NODE_CATALOG_MAP[d.nodeTypeId]

  return (
    <NodeWrapper
      category={NodeCategory.AUTOMATIC}
      label={d.label}
      icon={catalog?.icon || 'Cpu'}
      status={d.status}
      responsiblePartner={d.responsiblePartner}
      outputFilePath={d.outputFilePath}
      selected={selected}
      description={d.description}
      inputCount={(d.inputs ?? d.config?.inputs ?? []).length}
      outputCount={(d.outputs ?? d.config?.outputs ?? []).length}
      color={d.color}
    >
      {d.config?.apiEndpoint && (
        <p className="text-[10px] text-muted-foreground font-mono truncate mb-1">
          {d.config.apiEndpoint}
        </p>
      )}
      {d.status === NodeStatus.RUNNING && (
        <Progress value={d.progress ?? 0} className="h-1.5" />
      )}
    </NodeWrapper>
  )
}

export const AutomaticNode = memo(AutomaticNodeComponent)
