import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle, type DragEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
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
import { GroupNode } from './group-node'
import { useEditorStore } from '@/stores/editor-store'
import { NODE_CATALOG_MAP, DOMAIN_PALETTE_MAP, nodeColor } from '@/data/node-catalog'
import { useNodeTemplateStore } from '@/stores/node-template-store'
import { usePartnerStore } from '@/stores/partner-store'
import { NodeCategory, NodeKind, GatewayLogic } from '@/types/enums'
import type { FlowNodeDef, FlowEdgeDef, FlowGroupDef, NodeInputDef, NodeOutputDef, NodeSemantic } from '@/types/state-machine'
import { normalizeFlowNode, nodeDisplayName, normalizeResponsiblePartnerIds } from '@/lib/normalize-node'
import { CanvasLegend } from './canvas-legend'

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  automatic: AutomaticNode,
  manual: ManualNode,
  gateway: GatewayNode,
  storage: StorageNode,
  dtgroup: GroupNode,
}

// Geometry for the background group rectangle. The group node is recomputed
// from its member nodes' bounds (plus padding) so it always hugs the nodes it
// contains, regardless of how they are dragged.
const GROUP_PADDING = 32
const GROUP_HEADER = 18
const NODE_W = 180
const NODE_H = 60

/**
 * Map a NodeKind to one of the existing ReactFlow node visual types
 * (trigger/automatic/manual/gateway/storage). TASK collapses to `manual` by
 * default.
 */
function kindToReactFlowType(kind: NodeKind | undefined, legacy: NodeCategory | undefined): string {
  if (legacy) return legacy.toLowerCase()
  switch (kind) {
    case NodeKind.TRIGGER: return 'trigger'
    case NodeKind.GATEWAY: return 'gateway'
    case NodeKind.TASK:
    default: return 'manual'
  }
}

function toReactFlowNode(
  raw: FlowNodeDef,
  templateColorByKey?: Map<string, string>,
): Node {
  const n = normalizeFlowNode(raw)
  // Colour resolution: explicit data.color > template lookup (slug or
  // nodeTypeId match) > kind / legacy category mapping. Templates carry their
  // own colour from /settings → Node templates.
  const templateColor =
    templateColorByKey && (n.nodeTypeId ? templateColorByKey.get(n.nodeTypeId) : undefined)
  const color = nodeColor({ color: (raw as any).color ?? templateColor, kind: n.kind, category: n.type })
  return {
    id: n.id,
    type: kindToReactFlowType(n.kind, n.type),
    position: n.position,
    data: {
      // Visual label - node-wrapper.tsx reads `label`. We mirror `name` into it
      // so renaming a node propagates to the canvas without re-rendering logic.
      label: nodeDisplayName(n),
      name: n.name ?? nodeDisplayName(n),
      kind: n.kind ?? NodeKind.TASK,
      color,
      // legacy fields kept for components that still read them
      nodeTypeId: n.nodeTypeId,
      category: n.type,
      config: n.config,
      description: n.description,
      tags: n.tags,
      gateway: n.gateway,
      inputs: n.inputs,
      outputs: n.outputs,
      semantic: n.semantic,
      responsiblePartner: n.responsiblePartner,
      responsiblePartnerId: n.responsiblePartnerId,
      // Multi-partner responsible-partner list + visual group membership - round-trip without loss.
      responsiblePartnerIds: normalizeResponsiblePartnerIds(n),
      groupId: n.groupId,
    },
  }
}

function toReactFlowEdge(e: FlowEdgeDef): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.animated ?? true,
    style: { stroke: '#475569', strokeWidth: 2 },
    labelStyle: { fill: '#94a3b8', fontSize: 10 },
  }
}

function toFlowNode(n: Node): FlowNodeDef {
  const d = n.data as Record<string, unknown>
  const name = (d.name as string | undefined) ?? (d.label as string | undefined)
  return {
    id: n.id,
    kind: (d.kind as NodeKind | undefined),
    name,
    description: (d.description as string) || '',
    tags: (d.tags as string[] | undefined),
    responsiblePartnerId: (d.responsiblePartnerId as string | undefined),
    responsiblePartnerIds: (d.responsiblePartnerIds as string[] | undefined),
    groupId: (d.groupId as string | undefined),
    gateway: (d.gateway as FlowNodeDef['gateway']),
    inputs: (d.inputs as NodeInputDef[] | undefined),
    outputs: (d.outputs as NodeOutputDef[] | undefined),
    position: n.position,
    semantic: (d.semantic as NodeSemantic | undefined),
    // legacy carry-over
    type: d.category as NodeCategory,
    nodeTypeId: d.nodeTypeId as string,
    label: (d.label as string) ?? name,
    config: d.config as FlowNodeDef['config'],
    responsiblePartner: d.responsiblePartner as string | undefined,
  }
}

export interface EditorCanvasHandle {
  updateNodeData: (nodeId: string, updates: Partial<FlowNodeDef>) => void
  deleteNode: (nodeId: string) => void
  /** Currently selected node ids (for "Group selected"). */
  getSelectedNodeIds: () => string[]
  /** Current visual groups (canonical FlowGroupDef[]). */
  getGroups: () => FlowGroupDef[]
  /** Replace the full set of visual groups (marks the graph dirty). */
  setGroups: (groups: FlowGroupDef[]) => void
}

interface EditorCanvasProps {
  initialNodes: FlowNodeDef[]
  initialEdges: FlowEdgeDef[]
  /** Visual groups frozen alongside the graph. */
  initialGroups?: FlowGroupDef[]
  onSave: (nodes: FlowNodeDef[], edges: FlowEdgeDef[], groups: FlowGroupDef[]) => void
  onDirtyChange?: (dirty: boolean) => void
  /** Mirrors the live working graph so the properties panel can read unsaved nodes. */
  onWorkingNodesChange?: (nodes: FlowNodeDef[]) => void
  /** Mirrors the live working edges - the panel needs them for the predecessor.outputId dropdown. */
  onWorkingEdgesChange?: (edges: FlowEdgeDef[]) => void
  /** Mirrors the live working groups so the toolbar can read/update them. */
  onWorkingGroupsChange?: (groups: FlowGroupDef[]) => void
  /** Clicking a group's title on the canvas triggers a rename. */
  onEditGroup?: (groupId: string) => void
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
function EditorCanvas({ initialNodes, initialEdges, initialGroups, onSave, onDirtyChange, onWorkingNodesChange, onWorkingEdgesChange, onWorkingGroupsChange, onEditGroup }: EditorCanvasProps, ref) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  // Build a lookup so existing nodes (which only carry the legacy
  // `nodeTypeId` field) can still resolve their colour from the DB template
  // they were instantiated from. Key by both slug and template id.
  const templatesAtMount = useNodeTemplateStore.getState().templates
  const templateColorByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of templatesAtMount) {
      if (t.color) {
        m.set(t.id, t.color)
        m.set(t.slug, t.color)
      }
    }
    return m
  }, [templatesAtMount])
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes.map((n) => toReactFlowNode(n, templateColorByKey)))
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges.map(toReactFlowEdge))
  // Canonical visual groups. Stored separately from XYFlow nodes; we project
  // them into passive background group nodes for rendering only.
  const [groups, setGroupsState] = useState<FlowGroupDef[]>(initialGroups ?? [])
  const { selectNode } = useEditorStore()
  const isDirtyRef = useRef(false)
  const initialLoadRef = useRef(true)

  const markDirty = useCallback(() => {
    if (!isDirtyRef.current) {
      isDirtyRef.current = true
      onDirtyChange?.(true)
    }
  }, [onDirtyChange])

  const setGroups = useCallback((next: FlowGroupDef[]) => {
    setGroupsState(next)
    markDirty()
  }, [markDirty])

  // Mark dirty whenever nodes or edges change (but not on initial load)
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }
    markDirty()
  }, [nodes, edges, markDirty])

  // Mirror the working groups upward so the toolbar ("Group selected" / "Ungroup")
  // can read the current set without re-querying the store.
  useEffect(() => {
    onWorkingGroupsChange?.(groups)
  }, [groups, onWorkingGroupsChange])

  // Mirror the working graph upward - the canvas is the single source of truth
  // for nodes; the properties panel reads from this so freshly created (unsaved)
  // nodes resolve correctly when selected.
  useEffect(() => {
    onWorkingNodesChange?.(nodes.map(toFlowNode))
  }, [nodes, onWorkingNodesChange])

  useEffect(() => {
    onWorkingEdgesChange?.(
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label as string | undefined,
        animated: e.animated,
      })),
    )
  }, [edges, onWorkingEdgesChange])

  useImperativeHandle(ref, () => ({
    updateNodeData: (nodeId: string, updates: Partial<FlowNodeDef>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          // When `name` changes, keep `label` (visual) in sync. When `kind`
          // changes, also switch the ReactFlow visual type so the right
          // component renders.
          const nextType =
            updates.kind !== undefined
              ? kindToReactFlowType(updates.kind, updates.type)
              : n.type
          const labelPatch =
            updates.label !== undefined
              ? { label: updates.label }
              : updates.name !== undefined
              ? { label: updates.name }
              : {}
          // When kind changes via the panel, recompute the colour so the canvas
          // stays in sync with the palette mapping.
          const colorPatch =
            updates.kind !== undefined
              ? { color: nodeColor({ color: undefined, kind: updates.kind }) }
              : {}
          return {
            ...n,
            type: nextType,
            data: {
              ...n.data,
              ...labelPatch,
              ...colorPatch,
              ...(updates.name !== undefined ? { name: updates.name } : {}),
              ...(updates.kind !== undefined ? { kind: updates.kind } : {}),
              ...(updates.description !== undefined ? { description: updates.description } : {}),
              ...(updates.tags !== undefined ? { tags: updates.tags } : {}),
              ...(updates.gateway !== undefined ? { gateway: updates.gateway } : {}),
              ...(updates.inputs !== undefined ? { inputs: updates.inputs } : {}),
              ...(updates.outputs !== undefined ? { outputs: updates.outputs } : {}),
              ...(updates.semantic !== undefined ? { semantic: updates.semantic } : {}),
              // Use key-PRESENCE (not !== undefined) for the partner
              // mirrors so clearing all partners (writeResponsiblePartners([]) sends
              // responsiblePartnerId/responsiblePartner = undefined) actually
              // overwrites the stale legacy value instead of leaving it, which
              // normalizeResponsiblePartnerIds would otherwise resurrect.
              ...('responsiblePartnerId' in updates ? { responsiblePartnerId: updates.responsiblePartnerId } : {}),
              ...('responsiblePartnerIds' in updates ? { responsiblePartnerIds: updates.responsiblePartnerIds } : {}),
              ...(updates.groupId !== undefined ? { groupId: updates.groupId } : {}),
              ...(updates.type !== undefined ? { category: updates.type } : {}),
              ...(updates.config !== undefined ? { config: updates.config } : {}),
              ...('responsiblePartner' in updates ? { responsiblePartner: updates.responsiblePartner } : {}),
            },
          }
        }),
      )
    },
    deleteNode: (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      // Drop the deleted node from any group; remove now-empty groups.
      setGroupsState((gs) =>
        gs
          .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => id !== nodeId) }))
          .filter((g) => g.nodeIds.length > 0),
      )
    },
    getSelectedNodeIds: () =>
      nodes.filter((n) => n.selected && n.type !== 'group').map((n) => n.id),
    getGroups: () => groups,
    setGroups,
  }))

  // The rendered node list includes synthetic background group nodes (ids
  // prefixed `group-`). Those are derived state, not real nodes, so we drop
  // any change events targeting them before they reach `useNodesState`.
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const realChanges = changes.filter(
        (c) => !('id' in c && typeof c.id === 'string' && c.id.startsWith('group-')),
      )
      if (realChanges.length > 0) onNodesChange(realChanges)
    },
    [onNodesChange],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: '#475569', strokeWidth: 2 },
          },
          eds
        )
      )
    },
    [setEdges]
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Ignore clicks bubbling from synthetic background group nodes.
      if (node.type === 'dtgroup' || node.id.startsWith('group-')) return
      // Ctrl/⌘+click is a multi-select gesture (handled natively by XYFlow) -
      // it must NOT open the node-edit panel, only (de)select.
      if (event.ctrlKey || event.metaKey) return
      selectNode(node.id)
    },
    [selectNode]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const templateStore = useNodeTemplateStore()
  const partnersById = usePartnerStore((s) => s.partners)

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()

      // The palette accepts four drag payload shapes:
      //   - `application/reactflow-nodekind`     → generic node (NodeKind)
      //   - `application/reactflow-template-id`  → DB-backed NodeTemplate.id
      //   - `application/reactflow-domain-id`    → frontend constant DOMAIN_PALETTE (legacy / fallback)
      //   - `application/reactflow-nodetype`     → legacy NODE_CATALOG entry id
      const kindPayload = event.dataTransfer.getData('application/reactflow-nodekind') as NodeKind | ''
      const templateId = event.dataTransfer.getData('application/reactflow-template-id')
      const domainId = event.dataTransfer.getData('application/reactflow-domain-id')
      const legacyTypeId = event.dataTransfer.getData('application/reactflow-nodetype')

      const template = templateId
        ? templateStore.templates.find((t) => t.id === templateId)
        : undefined
      const domain = !template && domainId ? DOMAIN_PALETTE_MAP[domainId] : undefined
      const legacyCatalog = !template && !domain && legacyTypeId ? NODE_CATALOG_MAP[legacyTypeId] : null

      const kind: NodeKind = (() => {
        if (template) return template.kind
        if (domain) return domain.kind
        if (kindPayload) return kindPayload as NodeKind
        if (legacyCatalog) {
          if (legacyCatalog.category === NodeCategory.TRIGGER) return NodeKind.TRIGGER
          if (legacyCatalog.category === NodeCategory.GATEWAY) return NodeKind.GATEWAY
        }
        return NodeKind.TASK
      })()
      if (!template && !domain && !kindPayload && !legacyCatalog) return

      const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect()
      if (!wrapperBounds) return

      const position = {
        x: event.clientX - wrapperBounds.left - 90,
        y: event.clientY - wrapperBounds.top - 25,
      }

      const newNodeId = `node-${Date.now()}`
      const defaultName =
        kind === NodeKind.TRIGGER ? 'New trigger'
        : kind === NodeKind.GATEWAY ? 'New gateway'
        : 'New task'

      // Helper: rehydrate template inputs/outputs into canonical FlowNodeDef
      // shape. Predecessor `from` is left empty - the partner picks the
      // upstream output via the right-side dropdown after wiring an edge.
      const rehydrateInputs = (raws: any[]): NodeInputDef[] =>
        raws.map((i) => ({
          id: String(i.id),
          name: String(i.name ?? i.label ?? i.id),
          description: typeof i.description === 'string' ? i.description : undefined,
          cardinality: i.cardinality === 'MANY' ? 'MANY' : 'ONE',
          required: Boolean(i.required),
          fileTypes: Array.isArray(i.fileTypes) ? i.fileTypes.map(String) : [],
          source: (() => {
            const s = i.source
            if (s && typeof s === 'object' && s.kind === 'PREDECESSOR') {
              return { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } as const
            }
            if (s && typeof s === 'object' && s.kind === 'DATASOURCE') {
              return { kind: 'DATASOURCE', dataSourceId: '' } as const
            }
            if (typeof s === 'string') {
              if (s === 'PREDECESSOR') return { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } } as const
              if (s === 'DATASOURCE') return { kind: 'DATASOURCE', dataSourceId: '' } as const
            }
            return { kind: 'MANUAL' } as const
          })(),
        }))
      const rehydrateOutputs = (raws: any[]): NodeOutputDef[] =>
        raws.map((o) => ({
          id: String(o.id),
          name: String(o.name ?? o.label ?? o.id),
          description: typeof o.description === 'string' ? o.description : undefined,
          cardinality: o.cardinality === 'MANY' ? 'MANY' : 'ONE',
          required: Boolean(o.required),
          fileTypes: Array.isArray(o.fileTypes) ? o.fileTypes.map(String) : [],
        }))

      const sourceInputs = template?.inputs ?? domain?.inputs ?? []
      const sourceOutputs = template?.outputs ?? domain?.outputs ?? []
      const templateInputs = rehydrateInputs(sourceInputs)
      const templateOutputs = rehydrateOutputs(sourceOutputs)

      // Resolve responsible partner name from default partner id (DB template).
      const partnerName =
        (template?.defaultPartnerId ? partnersById[template.defaultPartnerId]?.name : undefined) ??
        domain?.defaultPartner ??
        legacyCatalog?.defaultPartner

      // Colour: explicit template colour > legacy catalog colour > kind colour.
      const color = nodeColor({
        color: template?.color ?? domain?.color ?? legacyCatalog?.color,
        kind,
      })

      const newNode: Node = {
        id: newNodeId,
        type: kindToReactFlowType(kind, undefined),
        position,
        data: {
          // Canonical fields
          name: template?.label ?? domain?.label ?? legacyCatalog?.label ?? defaultName,
          label: template?.label ?? domain?.label ?? legacyCatalog?.label ?? defaultName,
          kind,
          color,
          description: template?.description ?? domain?.description ?? legacyCatalog?.description ?? '',
          tags: template?.tags ?? domain?.tags ?? ([] as string[]),
          inputs: templateInputs,
          outputs: templateOutputs,
          ...(kind === NodeKind.GATEWAY ? { gateway: { logic: GatewayLogic.AND } } : {}),
          // Legacy carry-over so existing visual components / lookups keep working
          nodeTypeId: legacyCatalog?.id ?? domain?.id ?? template?.slug,
          category:
            kind === NodeKind.TRIGGER ? NodeCategory.TRIGGER
            : kind === NodeKind.GATEWAY ? NodeCategory.GATEWAY
            : NodeCategory.MANUAL,
          config: {} as Record<string, unknown>,
          responsiblePartnerId: template?.defaultPartnerId ?? undefined,
          responsiblePartner: partnerName,
        },
      }

      setNodes((nds) => [...nds, newNode])
    },
    [setNodes, templateStore.templates, partnersById]
  )

  // Project each group into a passive background rectangle node. Geometry is
  // derived from the live positions of its member nodes so the container
  // always hugs them. These nodes are non-selectable / non-draggable and sit
  // on z-index 0 (below the real nodes) so they never steal clicks.
  const groupBackgroundNodes = useMemo<Node[]>(() => {
    // Use each node's MEASURED size (post-render) so the container hugs the real
    // node bounds; fall back to the nominal estimate before measurement. This
    // prevents the dashed border from cutting through taller nodes.
    const boxById = new Map(
      nodes.map((n) => {
        const m = (n as any).measured ?? {}
        return [n.id, {
          x: n.position.x,
          y: n.position.y,
          w: m.width ?? (n as any).width ?? NODE_W,
          h: m.height ?? (n as any).height ?? NODE_H,
        }]
      }),
    )
    const out: Node[] = []
    for (const g of groups) {
      const members = g.nodeIds
        .map((id) => boxById.get(id))
        .filter((b): b is { x: number; y: number; w: number; h: number } => Boolean(b))
      if (members.length === 0) continue
      const minX = Math.min(...members.map((b) => b.x))
      const minY = Math.min(...members.map((b) => b.y))
      const maxX = Math.max(...members.map((b) => b.x + b.w))
      const maxY = Math.max(...members.map((b) => b.y + b.h))
      out.push({
        // NOTE: type 'dtgroup' (NOT XYFlow's reserved 'group') - the built-in
        // 'group' type carries a default grey `.react-flow__node-group` fill.
        id: `group-${g.id}`,
        type: 'dtgroup',
        position: { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING - GROUP_HEADER },
        width: maxX - minX + GROUP_PADDING * 2,
        height: maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER,
        data: { label: g.name, color: g.color, onRename: onEditGroup ? () => onEditGroup(g.id) : undefined },
        selectable: false,
        draggable: false,
        focusable: false,
        deletable: false,
        zIndex: 0,
        style: { zIndex: 0 },
      })
    }
    return out
  }, [groups, nodes, onEditGroup])

  // Background group nodes render FIRST (behind) - XYFlow draws in array order.
  const renderNodes = useMemo<Node[]>(
    () => [...groupBackgroundNodes, ...nodes],
    [groupBackgroundNodes, nodes],
  )

  const handleSave = useCallback(() => {
    const flowNodes: FlowNodeDef[] = nodes.map(toFlowNode)
    const flowEdges: FlowEdgeDef[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label as string | undefined,
      animated: e.animated,
    }))
    onSave(flowNodes, flowEdges, groups)
    isDirtyRef.current = false
    onDirtyChange?.(false)
  }, [nodes, edges, groups, onSave, onDirtyChange])

  // Expose save via window for the toolbar button - cleaned up on unmount
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__editorSave = handleSave
    return () => { delete (window as unknown as Record<string, unknown>).__editorSave }
  }, [handleSave])

  return (
    <div ref={reactFlowWrapper} className="flex-1 grid-background relative">
      <CanvasLegend mode="editor" />
      <ReactFlow
        nodes={renderNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode="Delete"
        className="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls className="!bg-slate-800 !border-slate-700" />
        <MiniMap
          className="!bg-slate-900"
          nodeColor="#475569"
          maskColor="rgba(15, 23, 42, 0.7)"
        />
      </ReactFlow>
    </div>
  )
})
