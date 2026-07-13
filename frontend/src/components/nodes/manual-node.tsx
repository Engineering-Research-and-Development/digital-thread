import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeCategory } from '@/types/enums'
import { NodeWrapper } from './node-wrapper'
import type { BaseNodeData } from '@/types/nodes'
import { NODE_CATALOG_MAP } from '@/data/node-catalog'

function ManualNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData
  const catalog = NODE_CATALOG_MAP[d.nodeTypeId]

  return (
    <NodeWrapper
      category={NodeCategory.MANUAL}
      label={d.label}
      icon={catalog?.icon || 'Wrench'}
      status={d.status}
      responsiblePartner={d.responsiblePartner}
      outputFilePath={d.outputFilePath}
      selected={selected}
      className="border-dashed"
      description={d.description}
      inputCount={(d.inputs ?? d.config?.inputs ?? []).length}
      outputCount={(d.outputs ?? d.config?.outputs ?? []).length}
      color={d.color}
    >
      {d.config?.instructions && (
        <p className="text-[10px] text-muted-foreground line-clamp-2">
          {d.config.instructions}
        </p>
      )}
    </NodeWrapper>
  )
}

export const ManualNode = memo(ManualNodeComponent)
