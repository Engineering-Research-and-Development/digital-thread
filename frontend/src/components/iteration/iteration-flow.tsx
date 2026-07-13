import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { TriggerNode } from '@/components/nodes/trigger-node'
import { AutomaticNode } from '@/components/nodes/automatic-node'
import { ManualNode } from '@/components/nodes/manual-node'
import { GatewayNode } from '@/components/nodes/gateway-node'
import { StorageNode } from '@/components/nodes/storage-node'
import { GroupNode } from '@/components/editor/group-node'
import { NodeKind, NodeStatus } from '@/types/enums'
import type { FlowNodeDef, FlowEdgeDef, FlowGroupDef, NodeRuntimeState } from '@/types/state-machine'
import { normalizeFlowNode, nodeDisplayName, normalizeGroups } from '@/lib/normalize-node'
import { nodeColor } from '@/data/node-catalog'
import { useNodeTemplateStore } from '@/stores/node-template-store'
import { CanvasLegend } from '@/components/editor/canvas-legend'
import { useMemo } from 'react'

function kindToReactFlowType(kind: NodeKind | undefined, legacy: string | undefined): string {
  if (legacy) return legacy.toLowerCase()
  switch (kind) {
    case NodeKind.TRIGGER: return 'trigger'
    case NodeKind.GATEWAY: return 'gateway'
    case NodeKind.TASK:
    default: return 'manual'
  }
}

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  automatic: AutomaticNode,
  manual: ManualNode,
  gateway: GatewayNode,
  storage: StorageNode,
  dtgroup: GroupNode,
}

// Keep the group-box footprint in sync with the editor canvas so the
// iteration view mirrors the authored grouping. (editor-canvas NODE_W/NODE_H/PADDING)
const NODE_W = 180
const NODE_H = 60
const GROUP_PADDING = 28
const GROUP_HEADER = 16

const edgeStatusColor: Record<string, string> = {
  completed: '#10B981',
  running: '#EAB308',
  error: '#EF4444',
  default: '#475569',
}

interface IterationFlowProps {
  nodes: FlowNodeDef[]
  edges: FlowEdgeDef[]
  nodeStatuses: Record<string, NodeRuntimeState>
  onNodeClick: (nodeId: string) => void
  highlightNodeId?: string | null
  /** Frozen visual node groups (rendered as passive background boxes). */
  groups?: FlowGroupDef[]
}

export function IterationFlow({ nodes, edges, nodeStatuses, onNodeClick, highlightNodeId, groups }: IterationFlowProps) {
  // Same colour resolution as the editor canvas: explicit > template lookup
  // (by nodeTypeId/slug) > kind / legacy category. Snapshot the store
  // synchronously so node colour is stable for the lifetime of this render.
  const templates = useNodeTemplateStore((s) => s.templates)
  const templateColorByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of templates) {
      if (t.color) {
        m.set(t.id, t.color)
        m.set(t.slug, t.color)
      }
    }
    return m
  }, [templates])

  const rfNodes: Node[] = nodes.map((raw) => {
    const n = normalizeFlowNode(raw)
    const state = nodeStatuses[n.id]
    const tplColor = n.nodeTypeId ? templateColorByKey.get(n.nodeTypeId) : undefined
    const color = nodeColor({ color: tplColor, kind: n.kind, category: n.type })
    return {
      id: n.id,
      type: kindToReactFlowType(n.kind, n.type),
      position: n.position,
      selected: n.id === highlightNodeId,
      data: {
        label: nodeDisplayName(n),
        name: n.name,
        kind: n.kind,
        color,
        nodeTypeId: n.nodeTypeId,
        category: n.type,
        config: n.config,
        description: n.description,
        tags: n.tags,
        inputs: n.inputs,
        outputs: n.outputs,
        status: state?.status || NodeStatus.IDLE,
        progress: state?.progress,
        responsiblePartner: n.responsiblePartner,
        responsiblePartnerId: n.responsiblePartnerId,
        claimedBy: state?.claimedBy,
        outputFilePath: state?.outputFilePath,
        highlighted: n.id === highlightNodeId,
      },
    }
  })

  // Passive group background boxes recomputed from member node bounds, drawn
  // BEHIND the nodes (z-index 0, non-interactive). Mirrors the editor canvas
  // so a reviewer sees the same grouping on the iteration.
  const groupBackgroundNodes: Node[] = (() => {
    const list = normalizeGroups(groups)
    if (list.length === 0) return []
    const posById = new Map(
      nodes.map((raw) => {
        const n = normalizeFlowNode(raw)
        return [n.id, n.position] as const
      }),
    )
    const out: Node[] = []
    for (const g of list) {
      const members = g.nodeIds
        .map((id) => posById.get(id))
        .filter((p): p is { x: number; y: number } => Boolean(p))
      if (members.length === 0) continue
      const minX = Math.min(...members.map((p) => p.x))
      const minY = Math.min(...members.map((p) => p.y))
      const maxX = Math.max(...members.map((p) => p.x + NODE_W))
      const maxY = Math.max(...members.map((p) => p.y + NODE_H))
      out.push({
        // 'dtgroup' (not XYFlow's reserved 'group', which has a default grey fill).
        id: `group-${g.id}`,
        type: 'dtgroup',
        position: { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING - GROUP_HEADER },
        width: maxX - minX + GROUP_PADDING * 2,
        height: maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER,
        data: { label: g.name, color: g.color },
        selectable: false,
        draggable: false,
        focusable: false,
        deletable: false,
        zIndex: 0,
        style: { zIndex: 0 },
      })
    }
    return out
  })()
  const allNodes: Node[] = [...groupBackgroundNodes, ...rfNodes]

  const rfEdges: Edge[] = edges.map((e) => {
    const sourceState = nodeStatuses[e.source]
    let color = edgeStatusColor.default
    if (sourceState?.status === NodeStatus.COMPLETED) color = edgeStatusColor.completed
    else if (sourceState?.status === NodeStatus.RUNNING) color = edgeStatusColor.running
    else if (sourceState?.status === NodeStatus.ERROR) color = edgeStatusColor.error

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: sourceState?.status === NodeStatus.RUNNING || sourceState?.status === NodeStatus.COMPLETED,
      style: { stroke: color, strokeWidth: 2 },
      labelStyle: { fill: '#94a3b8', fontSize: 10 },
    }
  })

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Ignore clicks on passive group background boxes.
      if (node.type === 'dtgroup' || node.id.startsWith('group-')) return
      onNodeClick(node.id)
    },
    [onNodeClick]
  )

  return (
    <div className="h-full w-full grid-background relative">
      <CanvasLegend mode="iteration" />
      <ReactFlow
        nodes={allNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        className="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls className="!bg-slate-800 !border-slate-700" />
        <MiniMap
          className="!bg-slate-900"
          nodeColor={(n) => {
            const st = (n.data as { status?: NodeStatus }).status
            if (st === NodeStatus.COMPLETED) return '#10B981'
            if (st === NodeStatus.RUNNING) return '#EAB308'
            if (st === NodeStatus.ERROR) return '#EF4444'
            return '#475569'
          }}
          maskColor="rgba(15, 23, 42, 0.7)"
        />
      </ReactFlow>
    </div>
  )
}
