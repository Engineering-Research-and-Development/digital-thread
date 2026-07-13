/**
 * Generic node model. A FlowNodeDef is the canonical shape stored in
 * StateMachine.nodesJson. It is intentionally domain-agnostic — name and
 * description characterise the node; inputs/outputs declare the file contract.
 *
 * The legacy fields (type/nodeTypeId/label/config) are kept readable so that
 * iterations created before this model was introduced keep deserialising.
 * They will be removed once the one-shot migration in
 * scripts/migrate-nodes-2026q2.ts has run on every deployment.
 */

// STORAGE removed from the kind enum. Legacy STORAGE nodes normalise to TASK.
export type NodeKind = 'TRIGGER' | 'TASK' | 'GATEWAY'
export type GatewayLogic = 'AND' | 'OR' | 'XOR'
export type Cardinality = 'ONE' | 'MANY'
export type Classification =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'PARTNER'
  | 'CONFIDENTIAL'
  | 'RESTRICTED'

export type InputSource =
  | { kind: 'MANUAL' }
  | { kind: 'PREDECESSOR'; from: { nodeId: string; outputId: string } }
  | { kind: 'DATASOURCE'; dataSourceId: string; query?: unknown }

export interface NodeInputDef {
  id: string
  name: string
  description?: string
  cardinality: Cardinality
  required: boolean
  fileTypes: string[]
  mimeTypes?: string[]
  maxSizeMB?: number
  source: InputSource
  semantic?: { aasSemanticId?: string }
}

export interface NodeOutputDef {
  id: string
  name: string
  description?: string
  cardinality: Cardinality
  required: boolean
  fileTypes: string[]
  /** Governance — default file classification suggested when a partner
   * uploads to this slot. Falls back to INTERNAL when unset. */
  defaultClassification?: Classification
  semantic?: { aasSemanticId?: string }
}

export interface NodeSemantic {
  aas?: { submodelId?: string; semanticId?: string }
  dtdl?: { interfaceId?: string }
  aml?: { systemUnitClassPath?: string }
}

export interface FlowNodeDef {
  id: string
  kind: NodeKind
  name: string
  description?: string
  tags?: string[]
  /**
   * Partners authorised to act on this node. A node may be shared by several
   * PARTNER teams. `responsiblePartnerIds` is canonical;
   * `responsiblePartnerId` (single) is kept for legacy machines and is always
   * mirrored to `responsiblePartnerIds[0]` by normalizeFlowNode so every reader
   * can consume the array uniformly. NOTE: this declares WHO MAY upload — the
   * provenance/lineage of a file always follows the ACTUAL uploader, never this.
   */
  responsiblePartnerId?: string
  responsiblePartnerIds?: string[]
  /** Id of the visual FlowGroupDef this node belongs to (optional). */
  groupId?: string
  gateway?: { logic: GatewayLogic }
  inputs: NodeInputDef[]
  outputs: NodeOutputDef[]
  position: { x: number; y: number }
  semantic?: NodeSemantic

  // ─── Legacy carry-over (do not consume in new code; read via normalizeFlowNode) ─
  type?: string
  nodeTypeId?: string
  label?: string
  responsiblePartner?: string
  config?: Record<string, unknown>
}

/**
 * A purely-visual grouping of nodes in the editor (a labelled container). It
 * carries no execution semantics, but is frozen into each StateMachineVersion
 * and surfaced in provenance/timeline/audit so a reviewer can see "which
 * group" an action happened in.
 */
export interface FlowGroupDef {
  id: string
  name: string
  color?: string
  nodeIds: string[]
  position?: { x: number; y: number }
  size?: { width: number; height: number }
}

export interface FlowEdgeDef {
  id: string
  source: string
  target: string
  label?: string
  animated?: boolean
}

/** Runtime per-output file map: outputId → FileRecord.id[]. */
export type NodeOutputsMap = Record<string, string[]>

/** Runtime per-input resolution status. */
export interface NodeInputStatus {
  provided: boolean
  resolvedFrom?: 'MANUAL' | 'PREDECESSOR' | 'DATASOURCE'
  fileIds?: string[]
  /** Legacy single-file pointer — kept readable until migration completes. */
  filePath?: string
}

export type NodeInputStatusesMap = Record<string, NodeInputStatus>
