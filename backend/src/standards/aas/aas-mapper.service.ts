import { Injectable } from '@nestjs/common'
import { normalizeFlowGroup, normalizeFlowNode } from '@/iterations/normalize-node'
import type { FlowGroupDef, FlowNodeDef, NodeInputDef, NodeOutputDef } from '@/iterations/types/flow-node'
import {
  conceptDescriptionsFor,
  en,
  extRef,
  modelRef,
  prop,
  refEl,
  sanitizeIdShort,
  smc,
} from './aas-core.util'
import { buildMwdSubmodel, mwdSubmodelIdForMachine } from './mwd-mapper'
import { MWD_DEFINITIONS } from './mwd-spec'
import {
  CATALOG_DEFINITIONS,
  CATALOG_NS,
  WF_DEFINITIONS,
  WF_NS,
  catalogSem,
  machineShellId,
  wfSem,
  workflowAssetId,
  workflowSubmodelId,
} from './workflow-def-spec'

/** idShort of a node SMC inside the WorkflowDefinition submodel. */
export function nodeIdShort(nodeId: string): string {
  return `node_${String(nodeId).replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 128)
}

export function edgeIdShort(edgeId: string): string {
  return `edge_${String(edgeId).replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 128)
}

/** Edges may lack an id (older machines); derive a stable one from the endpoints. */
export function edgeKey(edge: any): string {
  return typeof edge?.id === 'string' && edge.id ? edge.id : `${edge?.source ?? ''}-${edge?.target ?? ''}`
}

function parseArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * Nodes / edges / groups / tags of a machine, whether it comes straight from
 * Prisma (`*Json` strings) or deserialised by MachinesService (arrays).
 */
export function readMachineGraph(machine: any): {
  nodes: FlowNodeDef[]; edges: any[]; groups: FlowGroupDef[]; tags: string[]
} {
  const nodes = parseArray(machine.nodesJson ?? machine.nodes)
    .filter((n) => n && typeof n === 'object' && n.id)
    .map((n) => normalizeFlowNode(n))
  const edges = parseArray(machine.edgesJson ?? machine.edges).filter((e) => e && typeof e === 'object')
  const groups = parseArray(machine.groupsJson ?? machine.groups)
    .map(normalizeFlowGroup)
    .filter((g): g is FlowGroupDef => g !== null)
  const tags = parseArray(machine.tags).map(String)
  return { nodes, edges, groups, tags }
}

/**
 * Type-level AAS export of a StateMachine: an AAS 3.0 Environment with one
 * shell (assetKind Type), the WorkflowDefinition submodel, one IDTA 02100
 * Manufacturing Work Description submodel per TASK node and the
 * ConceptDescriptions of every semanticId used. Layout (positions, group
 * colours) is editor state, not domain data, and is not exported.
 */
@Injectable()
export class AasMapperService {
  machineToAas(machine: any) {
    const { nodes, edges, groups, tags } = readMachineGraph(machine)
    const machineId = String(machine.id)
    const name = String(machine.name ?? 'Workflow')
    const version = String(machine.version ?? '')
    const wfId = workflowSubmodelId(machineId)
    const mwdIdOf = (nodeId: string) => mwdSubmodelIdForMachine(machineId, nodeId)

    // Trigger and gateway nodes are not jobs: no MWD for them.
    const mwds = nodes.filter((n) => n.kind === 'TASK').map((n) => this.mwdFor(machine, n))
    const workflow = this.buildWorkflowSubmodel(wfId, name, version, tags, nodes, edges, groups, mwdIdOf)
    const submodels = [workflow, ...mwds]

    const shell = {
      modelType: 'AssetAdministrationShell',
      id: machineShellId(machineId),
      idShort: sanitizeIdShort(name, 'Workflow'),
      ...(machine.description ? { description: en(String(machine.description)) } : {}),
      assetInformation: { assetKind: 'Type', globalAssetId: workflowAssetId(machineId) },
      submodels: submodels.map((sm) => modelRef(['Submodel', sm.id])),
    }

    return {
      assetAdministrationShells: [shell],
      submodels,
      conceptDescriptions: conceptDescriptionsFor(submodels, { ...WF_DEFINITIONS, ...MWD_DEFINITIONS }),
    }
  }

  /**
   * Environment holding only the MWD of one TASK node (identical to the
   * submodel inside the full export) and its ConceptDescriptions. No
   * `assetAdministrationShells` key: the metamodel rejects empty lists.
   * Returns null when the node does not exist or is not a TASK.
   */
  nodeMwdToAas(machine: any, nodeId: string) {
    const node = readMachineGraph(machine).nodes.find((n) => n.id === nodeId)
    if (!node || node.kind !== 'TASK') return null
    const mwd = this.mwdFor(machine, node)
    return { submodels: [mwd], conceptDescriptions: conceptDescriptionsFor([mwd], MWD_DEFINITIONS) }
  }

  private mwdFor(machine: any, node: FlowNodeDef) {
    return buildMwdSubmodel({
      submodelId: mwdSubmodelIdForMachine(String(machine.id), node.id),
      node,
      version: String(machine.version ?? ''),
      publishedAt: machine.updatedAt,
      definitionType: 'pattern',
    })
  }

  private buildWorkflowSubmodel(
    wfId: string,
    name: string,
    version: string,
    tags: string[],
    nodes: FlowNodeDef[],
    edges: any[],
    groups: FlowGroupDef[],
    mwdIdOf: (nodeId: string) => string,
  ) {
    // (nodeId, outputId) → output SMC idShort, for the `sourceRef` model references.
    const outputIndex = new Map<string, string>()
    nodes.forEach((n) => n.outputs.forEach((o, i) => outputIndex.set(`${n.id}\u0000${o.id}`, `output_${i}`)))

    return {
      modelType: 'Submodel',
      id: wfId,
      idShort: 'WorkflowDefinition',
      kind: 'Instance',
      semanticId: extRef(WF_NS),
      description: en(`Workflow definition for ${name} v${version}`),
      submodelElements: [
        prop('workflowName', wfSem('workflowName'), name),
        prop('version', wfSem('version'), version),
        prop('tags', wfSem('tags'), JSON.stringify(tags)),
        ...nodes.map((n) => this.nodeToSmc(n, wfId, outputIndex, mwdIdOf)),
        ...edges.map((e) => this.edgeToRelationship(e, wfId)),
        ...(groups.length > 0 ? [this.groupsToSmc(groups)] : []),
      ],
    }
  }

  private nodeToSmc(
    node: FlowNodeDef,
    wfId: string,
    outputIndex: Map<string, string>,
    mwdIdOf: (nodeId: string) => string,
  ) {
    const S = (...p: string[]) => wfSem('Node', ...p)
    const displayName = node.name ?? node.label ?? node.id
    const children: object[] = [
      prop('nodeId', S('nodeId'), node.id),
      prop('kind', S('kind'), node.kind ?? 'TASK'),
      // legacy parity: category / nodeTypeId only when the node still has them
      ...(node.type ? [prop('nodeCategory', S('nodeCategory'), node.type)] : []),
      ...(node.nodeTypeId ? [prop('nodeTypeId', S('nodeTypeId'), node.nodeTypeId)] : []),
      prop('name', S('name'), displayName),
      prop('description', S('description'), node.description),
      prop('tags', S('tags'), JSON.stringify(node.tags ?? [])),
      ...(node.responsiblePartnerId ? [prop('responsiblePartnerId', S('responsiblePartnerId'), node.responsiblePartnerId)] : []),
      // Full multi-partner list (JSON array); responsiblePartnerId stays the primary.
      prop('responsiblePartnerIds', S('responsiblePartnerIds'), JSON.stringify(node.responsiblePartnerIds ?? [])),
      ...(node.responsiblePartner ? [prop('responsiblePartner', S('responsiblePartner'), node.responsiblePartner)] : []),
      ...(node.groupId ? [prop('groupId', S('groupId'), node.groupId)] : []),
      ...(node.gateway ? [prop('gatewayLogic', S('gatewayLogic'), node.gateway.logic)] : []),
      smc('inputs', S('Inputs'), (node.inputs ?? []).map((inp, i) => this.inputToSmc(inp, i, wfId, outputIndex))),
      smc('outputs', S('Outputs'), (node.outputs ?? []).map((out, i) => this.outputToSmc(out, i))),
    ]
    if (node.kind === 'TASK') {
      children.push(refEl('workDescription', S('workDescription'), modelRef(['Submodel', mwdIdOf(node.id)])))
    }
    return smc(nodeIdShort(node.id), S(), children, displayName)
  }

  private inputToSmc(inp: NodeInputDef, i: number, wfId: string, outputIndex: Map<string, string>) {
    const S = (...p: string[]) => wfSem('Node', 'Input', ...p)
    const src = inp.source
    const descriptor =
      src.kind === 'PREDECESSOR'
        ? `${src.kind}:${src.from.nodeId}.${src.from.outputId}`
        : src.kind === 'DATASOURCE'
          ? `${src.kind}:${src.dataSourceId}`
          : src.kind
    const outShort = src.kind === 'PREDECESSOR' ? outputIndex.get(`${src.from.nodeId}\u0000${src.from.outputId}`) : undefined
    return smc(`input_${i}`, wfSem('Node', 'Input'), [
      prop('id', S('id'), inp.id),
      prop('name', S('name'), inp.name ?? inp.id),
      prop('source', S('source'), descriptor),
      ...(src.kind === 'PREDECESSOR' && outShort
        ? [refEl('sourceRef', S('sourceRef'), modelRef(
          ['Submodel', wfId],
          ['SubmodelElementCollection', nodeIdShort(src.from.nodeId)],
          ['SubmodelElementCollection', 'outputs'],
          ['SubmodelElementCollection', outShort],
        ))]
        : []),
      prop('cardinality', S('cardinality'), inp.cardinality),
      prop('required', S('required'), String(Boolean(inp.required)), 'xs:boolean'),
      prop('fileTypes', S('fileTypes'), JSON.stringify(inp.fileTypes ?? [])),
    ])
  }

  private outputToSmc(out: NodeOutputDef, i: number) {
    const S = (...p: string[]) => wfSem('Node', 'Output', ...p)
    return smc(`output_${i}`, wfSem('Node', 'Output'), [
      prop('id', S('id'), out.id),
      prop('name', S('name'), out.name ?? out.id),
      prop('cardinality', S('cardinality'), out.cardinality),
      prop('required', S('required'), String(Boolean(out.required)), 'xs:boolean'),
      prop('fileTypes', S('fileTypes'), JSON.stringify(out.fileTypes ?? [])),
    ])
  }

  private edgeToRelationship(edge: any, wfId: string) {
    const id = edgeKey(edge)
    return {
      modelType: 'AnnotatedRelationshipElement',
      idShort: edgeIdShort(id),
      semanticId: extRef(wfSem('Edge')),
      first: modelRef(['Submodel', wfId], ['SubmodelElementCollection', nodeIdShort(String(edge.source ?? ''))]),
      second: modelRef(['Submodel', wfId], ['SubmodelElementCollection', nodeIdShort(String(edge.target ?? ''))]),
      annotations: [
        // The idShort mangles the id; the annotation carries it verbatim for the importer.
        prop('edgeId', wfSem('Edge', 'edgeId'), id),
        ...(edge.label ? [prop('label', wfSem('Edge', 'label'), String(edge.label))] : []),
      ],
    }
  }

  /** Node groups: membership only (colour / bounds are layout). */
  private groupsToSmc(groups: FlowGroupDef[]) {
    return smc('groups', wfSem('Groups'), groups.map((g, i) =>
      smc(`group_${i}`, wfSem('Group'), [
        prop('groupId', wfSem('Group', 'groupId'), g.id),
        prop('name', wfSem('Group', 'name'), g.name),
        prop('nodeIds', wfSem('Group', 'nodeIds'), JSON.stringify(g.nodeIds)),
      ]),
    ))
  }

  /** AAS Environment for the node type catalog. */
  nodeCatalogToAas(catalog: any[]) {
    const smId = 'urn:digitalthread:sm:node-type-catalog:1.0'
    const T = (...p: string[]) => catalogSem('NodeType', ...p)
    const submodel = {
      modelType: 'Submodel',
      id: smId,
      idShort: 'NodeTypeCatalog',
      kind: 'Instance',
      semanticId: extRef(CATALOG_NS),
      submodelElements: catalog.map((entry) => smc(sanitizeIdShort(entry.nodeTypeId, 'NodeType'), T(), [
        prop('nodeTypeId', T('nodeTypeId'), entry.nodeTypeId),
        prop('category', T('category'), entry.category),
        prop('label', T('label'), entry.label),
        prop('color', T('color'), entry.color),
        prop('icon', T('icon'), entry.icon),
        prop('description', T('description'), entry.description),
        prop('defaultPartner', T('defaultPartner'), entry.defaultPartner),
        prop('expectedOutput', T('expectedOutput'), entry.expectedOutput),
      ])),
    }
    const shell = {
      modelType: 'AssetAdministrationShell',
      id: 'urn:digitalthread:aas:node-catalog:1.0',
      idShort: 'NodeTypeCatalog',
      assetInformation: { assetKind: 'Type', globalAssetId: 'urn:digitalthread:asset:node-catalog' },
      submodels: [modelRef(['Submodel', smId])],
    }
    return {
      assetAdministrationShells: [shell],
      submodels: [submodel],
      conceptDescriptions: conceptDescriptionsFor([submodel], CATALOG_DEFINITIONS),
    }
  }
}
