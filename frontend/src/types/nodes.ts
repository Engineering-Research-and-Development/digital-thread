import type { NodeCategory, NodeKind, NodeStatus } from './enums'
import type { NodeConfig, NodeInputDef, NodeOutputDef, NodeSemantic } from './state-machine'

export interface BaseNodeData extends Record<string, unknown> {
  label: string
  /** Canonical name. Mirrored into `label` for legacy renderers. */
  name?: string
  /** Canonical kind. Mirrored into `category` for legacy renderers. */
  kind?: NodeKind
  nodeTypeId: string
  category: NodeCategory
  config: NodeConfig
  status?: NodeStatus
  description?: string
  tags?: string[]
  inputs?: NodeInputDef[]
  outputs?: NodeOutputDef[]
  semantic?: NodeSemantic
  responsiblePartner?: string
  responsiblePartnerId?: string
  /** Multi-partner — canonical authorised-partner list. */
  responsiblePartnerIds?: string[]
  /** Visual group membership. */
  groupId?: string
  claimedBy?: string
  outputFilePath?: string
  /** Explicit colour override (e.g. from a domain template). Falls
   * back to KIND_COLORS / CATEGORY_COLORS when absent. Resolve via nodeColor(). */
  color?: string
}

export interface AutomaticNodeData extends BaseNodeData {
  category: typeof import('./enums').NodeCategory.AUTOMATIC
  progress?: number
}
