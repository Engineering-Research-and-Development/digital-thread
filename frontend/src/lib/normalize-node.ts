/**
 * Frontend mirror of backend/src/iterations/normalize-node.ts.
 * Every UI component that reads a FlowNodeDef from the API or from the store
 * must go through normalizeFlowNode so it sees the canonical generic node shape
 * regardless of whether the machine was saved before or after the migration.
 */

import type {
  FlowGroupDef,
  FlowNodeDef,
  InputSource,
  NodeInputDef,
  NodeOutputDef,
} from '@/types/state-machine'
import { Cardinality, Classification, CLASSIFICATION_LIST, GatewayLogic, NodeKind } from '@/types/enums'

/**
 * Canonical multi-partner list with legacy single fallback.
 * De-duplicated, non-empty strings.
 */
export function normalizeResponsiblePartnerIds(raw: any): string[] {
  const out: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim() && !out.includes(v)) out.push(v)
  }
  if (Array.isArray(raw?.responsiblePartnerIds)) raw.responsiblePartnerIds.forEach(push)
  push(raw?.responsiblePartnerId)
  return out
}

function normalizeClassification(raw: any): Classification | undefined {
  return typeof raw === 'string' && (CLASSIFICATION_LIST as string[]).includes(raw)
    ? (raw as Classification)
    : undefined
}

const KIND_BY_CATEGORY: Record<string, NodeKind> = {
  TRIGGER: NodeKind.TRIGGER,
  AUTOMATIC: NodeKind.TASK,
  MANUAL: NodeKind.TASK,
  GATEWAY: NodeKind.GATEWAY,
  // STORAGE kind removed; legacy STORAGE nodes normalise to TASK.
  STORAGE: NodeKind.TASK,
}

function inferKind(raw: any): NodeKind {
  // Map through the table (not the raw value) so legacy 'STORAGE' → TASK.
  if (raw?.kind && KIND_BY_CATEGORY[String(raw.kind)]) return KIND_BY_CATEGORY[String(raw.kind)]
  if (typeof raw?.type === 'string' && KIND_BY_CATEGORY[raw.type]) return KIND_BY_CATEGORY[raw.type]
  return NodeKind.TASK
}

function normalizeCardinality(raw: any): Cardinality {
  return raw === Cardinality.MANY ? Cardinality.MANY : Cardinality.ONE
}

function normalizeSource(raw: any): InputSource {
  if (raw && typeof raw === 'object' && typeof raw.kind === 'string') {
    if (raw.kind === 'PREDECESSOR') {
      // Preserve the PREDECESSOR kind even when `from` is partially
      // filled (intermediate editor state right after the user picks "From
      // predecessor" but before picking node+output). The runtime engine
      // tolerates empty `from` values (it just won't resolve) — only the
      // editor needs to keep the kind sticky so the dropdown stays open.
      const fromObj = raw.from && typeof raw.from === 'object' ? raw.from : {}
      return {
        kind: 'PREDECESSOR',
        from: {
          nodeId: typeof fromObj.nodeId === 'string' ? fromObj.nodeId : '',
          outputId: typeof fromObj.outputId === 'string' ? fromObj.outputId : '',
        },
      }
    }
    if (raw.kind === 'DATASOURCE') {
      return {
        kind: 'DATASOURCE',
        dataSourceId: typeof raw.dataSourceId === 'string' ? raw.dataSourceId : '',
        query: raw.query,
      }
    }
    if (raw.kind === 'MANUAL') return { kind: 'MANUAL' }
  }
  // Legacy bare-string source — not enough info to materialise the canonical
  // shape; fall back to MANUAL and let the editor re-declare the binding.
  return { kind: 'MANUAL' }
}

function normalizeInput(raw: any, idx: number): NodeInputDef {
  const id = String(raw?.id ?? `in_${idx + 1}`)
  const name = String(raw?.name ?? raw?.label ?? id)
  const fileTypes = Array.isArray(raw?.fileTypes)
    ? raw.fileTypes.map((e: unknown) => String(e).toLowerCase()).filter(Boolean)
    : []
  // Legacy: bare-string `source` + adjacent dataSourceId
  let source: InputSource
  if (raw?.source && typeof raw.source === 'object') {
    source = normalizeSource(raw.source)
  } else if (typeof raw?.source === 'string' && raw.source === 'DATASOURCE' && raw?.dataSourceId) {
    source = { kind: 'DATASOURCE', dataSourceId: String(raw.dataSourceId) }
  } else {
    source = normalizeSource(raw?.source)
  }
  return {
    id,
    name,
    description: typeof raw?.description === 'string' ? raw.description : undefined,
    cardinality: normalizeCardinality(raw?.cardinality),
    required: Boolean(raw?.required ?? false),
    fileTypes,
    mimeTypes: Array.isArray(raw?.mimeTypes) ? raw.mimeTypes.map(String) : undefined,
    maxSizeMB: typeof raw?.maxSizeMB === 'number' ? raw.maxSizeMB : undefined,
    source,
    semantic: raw?.semantic,
    label: typeof raw?.label === 'string' ? raw.label : undefined,
  }
}

function normalizeOutput(raw: any, idx: number): NodeOutputDef {
  const id = String(raw?.id ?? `out_${idx + 1}`)
  const name = String(raw?.name ?? raw?.label ?? id)
  const fileTypes = Array.isArray(raw?.fileTypes)
    ? raw.fileTypes.map((e: unknown) => String(e).toLowerCase()).filter(Boolean)
    : []
  return {
    id,
    name,
    description: typeof raw?.description === 'string' ? raw.description : undefined,
    cardinality: normalizeCardinality(raw?.cardinality),
    required: Boolean(raw?.required ?? false),
    fileTypes,
    defaultClassification: normalizeClassification(raw?.defaultClassification),
    semantic: raw?.semantic,
    label: typeof raw?.label === 'string' ? raw.label : undefined,
  }
}

export function normalizeFlowNode(raw: any): FlowNodeDef {
  if (!raw || typeof raw !== 'object' || !raw.id) {
    throw new Error('normalizeFlowNode: invalid node payload (missing id)')
  }

  const kind = inferKind(raw)
  const name = String(raw.name ?? raw.label ?? raw.id)

  const inputsRaw: any[] = Array.isArray(raw.inputs)
    ? raw.inputs
    : Array.isArray(raw?.config?.inputs)
    ? raw.config.inputs
    : []
  const outputsRaw: any[] = Array.isArray(raw.outputs)
    ? raw.outputs
    : Array.isArray(raw?.config?.outputs)
    ? raw.config.outputs
    : []

  const inputs = inputsRaw.map(normalizeInput)
  const outputs = outputsRaw.map(normalizeOutput)

  // Legacy MANUAL nodes often have no explicit outputs[]; expose a `default`
  // output so predecessor lookups can still find a slot. Idempotent.
  if (kind === NodeKind.TASK && outputs.length === 0) {
    const expected = typeof raw?.config?.expectedOutput === 'string' ? raw.config.expectedOutput : undefined
    outputs.push({
      id: 'default',
      name: expected ? `Output (${expected})` : 'Output',
      cardinality: Cardinality.ONE,
      required: false,
      fileTypes: Array.isArray(raw?.config?.requiredFileTypes)
        ? raw.config.requiredFileTypes.map((e: unknown) => String(e).toLowerCase())
        : [],
    })
  }

  const gatewayLogic: GatewayLogic =
    raw?.gateway?.logic ?? raw?.config?.gateType ?? GatewayLogic.AND

  // Kind-specific I/O shape:
  //   TRIGGER → no inputs (pipeline entry point).
  //   GATEWAY → outputs mirror inputs 1:1 (it forwards all received inputs).
  const finalInputs = kind === NodeKind.TRIGGER ? [] : inputs
  const finalOutputs =
    kind === NodeKind.GATEWAY
      ? finalInputs.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          cardinality: i.cardinality,
          required: i.required,
          fileTypes: i.fileTypes ?? [],
        }))
      : outputs

  const responsiblePartnerIds = normalizeResponsiblePartnerIds(raw)

  return {
    id: String(raw.id),
    kind,
    name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    // Multi-partner: canonical array + legacy single mirror (= primary).
    responsiblePartnerIds,
    responsiblePartnerId: responsiblePartnerIds[0]
      ?? (typeof raw.responsiblePartnerId === 'string' ? raw.responsiblePartnerId : undefined),
    groupId: typeof raw.groupId === 'string' ? raw.groupId : undefined,
    gateway: kind === NodeKind.GATEWAY ? { logic: gatewayLogic } : undefined,
    inputs: finalInputs,
    outputs: finalOutputs,
    position: raw.position && typeof raw.position === 'object' ? raw.position : { x: 0, y: 0 },
    semantic: raw.semantic,
    // legacy carry-over (read-only)
    type: raw.type,
    nodeTypeId: raw.nodeTypeId,
    label: typeof raw.label === 'string' ? raw.label : name,
    config: raw.config,
    responsiblePartner: typeof raw.responsiblePartner === 'string' ? raw.responsiblePartner : undefined,
  }
}

export function normalizeNodes(raw: unknown): FlowNodeDef[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeFlowNode)
}

/** Normalise visual node groups (defensive). */
export function normalizeFlowGroup(raw: any): FlowGroupDef | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Group',
    color: typeof raw.color === 'string' ? raw.color : undefined,
    nodeIds: Array.isArray(raw.nodeIds) ? raw.nodeIds.map(String).filter(Boolean) : [],
    position: raw.position && typeof raw.position === 'object'
      ? { x: Number(raw.position.x) || 0, y: Number(raw.position.y) || 0 }
      : undefined,
    size: raw.size && typeof raw.size === 'object'
      ? { width: Number(raw.size.width) || 0, height: Number(raw.size.height) || 0 }
      : undefined,
  }
}

export function normalizeGroups(raw: unknown): FlowGroupDef[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeFlowGroup).filter((g): g is FlowGroupDef => g !== null)
}

/** Convenience: returns the canonical display name for a node. */
export function nodeDisplayName(node: Pick<FlowNodeDef, 'name' | 'label' | 'id'>): string {
  return node.name ?? node.label ?? node.id
}
