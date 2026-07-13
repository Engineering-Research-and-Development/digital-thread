import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeCategory } from '@/types/enums'
import { NodeWrapper } from './node-wrapper'
import type { BaseNodeData } from '@/types/nodes'

function TriggerNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as BaseNodeData
  return (
    <NodeWrapper
      category={NodeCategory.TRIGGER}
      label={d.label}
      icon={d.nodeTypeId === 'MATERIAL_CHANGE' ? 'RefreshCw' : 'Upload'}
      status={d.status}
      responsiblePartner={d.responsiblePartner}
      outputFilePath={d.outputFilePath}
      hasTarget={false}
      hasSource={true}
      selected={selected}
      description={d.description}
      inputCount={(d.inputs ?? d.config?.inputs ?? []).length}
      outputCount={(d.outputs ?? d.config?.outputs ?? []).length}
      color={d.color}
    >
      {d.config?.watchPath && (
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          {d.config.watchPath}
        </p>
      )}
    </NodeWrapper>
  )
}

export const TriggerNode = memo(TriggerNodeComponent)
