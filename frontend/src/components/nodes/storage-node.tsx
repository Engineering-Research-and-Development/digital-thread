import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeCategory } from '@/types/enums'
import { NodeWrapper } from './node-wrapper'
import type { BaseNodeData } from '@/types/nodes'
import { NODE_CATALOG_MAP } from '@/data/node-catalog'

function StorageNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData
  const catalog = NODE_CATALOG_MAP[d.nodeTypeId]

  return (
    <NodeWrapper
      category={NodeCategory.STORAGE}
      label={d.label}
      icon={catalog?.icon || 'Database'}
      status={d.status}
      responsiblePartner={d.responsiblePartner}
      outputFilePath={d.outputFilePath}
      hasTarget={true}
      hasSource={false}
      selected={selected}
      className="rounded-t-2xl"
      description={d.description}
      inputCount={(d.inputs ?? d.config?.inputs ?? []).length}
      outputCount={(d.outputs ?? d.config?.outputs ?? []).length}
      color={d.color}
    >
      {d.config?.outputBucket && (
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          /{d.config.outputBucket}/
        </p>
      )}
    </NodeWrapper>
  )
}

export const StorageNode = memo(StorageNodeComponent)
