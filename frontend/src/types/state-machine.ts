import type {
  NodeCategory,
  IterationStatus,
  NodeStatus,
  DataSourceType,
  DataSourceProtocol,
  InputSourceType,
  NodeKind,
  Cardinality,
  GatewayLogic,
  Classification,
} from './enums'

// ─── Generic node I/O contract ────────────────────────────────────────────────

export type InputSourceManual = { kind: 'MANUAL' }
export type InputSourcePredecessor = {
  kind: 'PREDECESSOR'
  from: { nodeId: string; outputId: string }
}
export type InputSourceDataSource = {
  kind: 'DATASOURCE'
  dataSourceId: string
  query?: unknown
}
export type InputSource = InputSourceManual | InputSourcePredecessor | InputSourceDataSource

export interface NodeInputDef {
  id: string
  /** Canonical name shown in UI. Older payloads used `label`. */
  name?: string
  description?: string
  cardinality?: Cardinality
  required?: boolean
  /** Whitelist of accepted file extensions, e.g. ['.step', '.iges']. */
  fileTypes?: string[]
  mimeTypes?: string[]
  maxSizeMB?: number
  /** Accepts either the new InputSource discriminated union or the
   * legacy bare-string `InputSourceType` ('PREDECESSOR' | 'MANUAL' | 'DATASOURCE').
   * Components must run inputs through normalizeFlowNode before reading `source`. */
  source?: InputSource | InputSourceType
  /** Legacy companion to `source: 'DATASOURCE'`. */
  dataSourceId?: string
  semantic?: { aasSemanticId?: string }
  /** Legacy display name (renamed to `name` in the generic node model). */
  label?: string
}

export interface NodeOutputDef {
  id: string
  name?: string
  description?: string
  cardinality?: Cardinality
  required?: boolean
  fileTypes?: string[]
  semantic?: { aasSemanticId?: string }
  /** Governance — default file classification suggested when a partner
   * uploads to this slot. The partner can override at upload time (within the
   * limits of their role); when unset, the upload defaults to INTERNAL. */
  defaultClassification?: Classification
  /** Legacy display name (renamed to `name` in the generic node model). */
  label?: string
}

export interface NodeSemantic {
  aas?: { submodelId?: string; semanticId?: string }
  dtdl?: { interfaceId?: string }
  aml?: { systemUnitClassPath?: string }
}

// Kept for round-trip with legacy state machines. New code should read
// `node.inputs` and `node.outputs` directly off FlowNodeDef.
export interface NodeConfig {
  apiEndpoint?: string
  timeout?: number
  retryCount?: number
  instructions?: string
  requiredFileTypes?: string[]
  condition?: string
  gateType?: GatewayLogic
  triggerType?: 'CAD_UPLOAD' | 'MATERIAL_CHANGE'
  watchPath?: string
  outputBucket?: string
  reportTemplate?: string
  expectedOutput?: string
  dataSourceId?: string
  inputs?: NodeInputDef[]
  outputs?: NodeOutputDef[]
}

export interface FlowNodeDef {
  id: string
  /** New canonical discriminator. Falls back to derived value when absent. */
  kind?: NodeKind
  /** Canonical display name shown on the canvas in editor + iteration. */
  name?: string
  description?: string
  tags?: string[]
  /**
   * Multi-partner: `responsiblePartnerIds` is canonical; the single
   * `responsiblePartnerId` is kept for legacy machines and mirrors
   * `responsiblePartnerIds[0]`. Declares WHO MAY upload — not who actually did.
   */
  responsiblePartnerId?: string
  responsiblePartnerIds?: string[]
  /** Id of the visual group this node belongs to (optional). */
  groupId?: string
  gateway?: { logic: GatewayLogic }
  inputs?: NodeInputDef[]
  outputs?: NodeOutputDef[]
  position: { x: number; y: number }
  semantic?: NodeSemantic

  // ─── Legacy fields ─────────────────────────────────────────────────────────
  // Kept so machines saved before the generic node model keep loading. Components
  // must not write to these directly — go through normalizeFlowNode().
  type?: NodeCategory
  nodeTypeId?: string
  label?: string
  config?: NodeConfig
  responsiblePartner?: string
}

/** Purely-visual node grouping (a labelled container). */
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

export interface StateMachine {
  id: string
  name: string
  version: string
  description: string
  createdAt: string
  updatedAt: string
  nodes: FlowNodeDef[]
  edges: FlowEdgeDef[]
  /** Visual node groups (presentational, frozen per version). */
  groups?: FlowGroupDef[]
  tags: string[]
  /** Auto-incremented immutable version number, bumped on every save. */
  latestVersion?: number
}

export interface TimelineEvent {
  id: string
  timestamp: string
  nodeId: string
  nodeLabel: string
  partner: string
  action: string
  detail: string
  filePath?: string
}

export interface IterationVersionSummary {
  id: string
  versionNumber: number
  versionLabel?: string | null
  createdAt?: string
}

export interface Iteration {
  id: string
  displayId: string
  machineId: string
  machineName: string
  status: IterationStatus
  createdAt: string
  completedAt?: string
  metadata: Record<string, string>
  parentIterationId?: string
  restartFromNodeId?: string
  /** Owning Partner (mandatory for new iterations). */
  ownerPartnerId?: string | null
  ownerPartner?: { id: string; name: string; country?: string } | null
  /** Attached Product (optional). */
  productId?: string | null
  product?: { id: string; urn: string; name: string } | null
  timeline: TimelineEvent[]
  /** Frozen state-machine version this iteration was instantiated against. */
  version?: IterationVersionSummary | null
  /** Workflow snapshot frozen at iteration create (nodes/edges from `version`). */
  snapshotNodes?: FlowNodeDef[]
  snapshotEdges?: FlowEdgeDef[]
  /** Frozen visual node groups, mirrored into the iteration canvas. */
  snapshotGroups?: FlowGroupDef[]
}

export interface NodeRuntimeInputStatus {
  provided: boolean
  resolvedFrom?: 'MANUAL' | 'PREDECESSOR' | 'DATASOURCE'
  fileIds?: string[]
  /** Legacy single-file pointer — kept readable until migration completes. */
  filePath?: string
}

export interface NodeRuntimeState {
  nodeId: string
  status: NodeStatus
  startedAt?: string
  completedAt?: string
  logs: string[]
  /** Map outputId → FileRecord.id[]. */
  outputs?: Record<string, string[]>
  /** Legacy single-output pointer. New code reads `outputs.default`. */
  outputFilePath?: string
  errorMessage?: string
  progress?: number
  claimedBy?: string
  inputFileStatuses?: Record<string, NodeRuntimeInputStatus>
}

export interface Partner {
  id: string
  name: string
  fullName: string
  /** Mandatory ISO 3166-1 alpha-2 country code. */
  country: string
  color: string
  role?: string
}

/** Product registry entry (urn + name + owning Partner). */
export interface Product {
  id: string
  urn: string
  name: string
  description?: string | null
  ownerPartnerId: string
  ownerPartner?: { id: string; name: string; color?: string } | null
  iterationCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface DataSource {
  id: string
  name: string
  type: DataSourceType
  protocol?: DataSourceProtocol
  endpoint: string
  description?: string
}

// ─── Legacy alias re-exports (some legacy callers import these directly) ────
export type { InputSourceType }
