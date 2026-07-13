import { Injectable } from '@nestjs/common'
import { normalizeFlowNode } from '@/iterations/normalize-node'
import type { FlowNodeDef } from '@/iterations/types/flow-node'

const CATEGORY_COLOR: Record<string, string> = {
  TRIGGER: '#10B981', AUTOMATIC: '#8B5CF6', MANUAL: '#3B82F6',
  GATEWAY: '#F59E0B', STORAGE: '#6B7280',
}

@Injectable()
export class AasMapperService {
  /** Build an AAS JSON-LD document from a StateMachine DB record */
  machineToAas(machine: any) {
    const rawNodes = typeof machine.nodesJson === 'string' ? JSON.parse(machine.nodesJson) : machine.nodes ?? []
    const edges = typeof machine.edgesJson === 'string' ? JSON.parse(machine.edgesJson) : machine.edges ?? []
    const tags = typeof machine.tags === 'string' ? JSON.parse(machine.tags) : machine.tags ?? []
    const nodes: FlowNodeDef[] = rawNodes.map((n: any) => normalizeFlowNode(n))

    return {
      modelType: 'AssetAdministrationShell',
      id: `urn:digitalthread:aas:machine:${machine.id}`,
      idShort: machine.name.replace(/[^a-zA-Z0-9_]/g, '_'),
      assetInformation: {
        assetKind: 'Type',
        globalAssetId: `urn:digitalthread:asset:workflow:${machine.id}`,
      },
      description: machine.description ? [{ language: 'en', text: machine.description }] : [],
      submodels: [
        { type: 'ExternalReference', keys: [{ type: 'Submodel', value: `urn:digitalthread:sm:workflow-def:${machine.id}` }] },
      ],
      submodelInline: [
        this.buildWorkflowSubmodel(machine.id, machine.name, machine.version, tags, nodes, edges),
      ],
    }
  }

  private buildWorkflowSubmodel(id: string, name: string, version: string, tags: string[], nodes: FlowNodeDef[], edges: any[]) {
    const nodeElements = nodes.map((n) => this.nodeToSmc(n))
    const edgeElements = edges.map((e: any) => this.edgeToAnnotatedRel(e))

    return {
      modelType: 'Submodel',
      id: `urn:digitalthread:sm:workflow-def:${id}`,
      idShort: 'WorkflowDefinition',
      description: [{ language: 'en', text: `Workflow definition for ${name} v${version}` }],
      submodelElements: [
        {
          modelType: 'Property', idShort: 'workflowName',
          valueType: 'xs:string', value: name,
        },
        {
          modelType: 'Property', idShort: 'version',
          valueType: 'xs:string', value: version,
        },
        {
          modelType: 'Property', idShort: 'tags',
          valueType: 'xs:string', value: JSON.stringify(tags),
        },
        ...nodeElements,
        ...edgeElements,
      ],
    }
  }

  private nodeToSmc(node: FlowNodeDef) {
    const inputs = node.inputs ?? []
    const outputs = node.outputs ?? []
    const displayName = node.name ?? node.label ?? node.id

    return {
      modelType: 'SubmodelElementCollection',
      idShort: `node_${node.id.replace(/-/g, '_')}`,
      value: [
        { modelType: 'Property', idShort: 'nodeId', valueType: 'xs:string', value: node.id },
        { modelType: 'Property', idShort: 'kind', valueType: 'xs:string', value: node.kind ?? 'TASK' },
        // legacy parity — keep category/nodeTypeId for older consumers
        { modelType: 'Property', idShort: 'nodeCategory', valueType: 'xs:string', value: node.type ?? '' },
        { modelType: 'Property', idShort: 'nodeTypeId', valueType: 'xs:string', value: node.nodeTypeId ?? '' },
        { modelType: 'Property', idShort: 'name', valueType: 'xs:string', value: displayName },
        { modelType: 'Property', idShort: 'description', valueType: 'xs:string', value: node.description ?? '' },
        { modelType: 'Property', idShort: 'tags', valueType: 'xs:string', value: JSON.stringify(node.tags ?? []) },
        { modelType: 'Property', idShort: 'responsiblePartnerId', valueType: 'xs:string', value: node.responsiblePartnerId ?? '' },
        // Full multi-partner list (JSON array); responsiblePartnerId stays the primary.
        { modelType: 'Property', idShort: 'responsiblePartnerIds', valueType: 'xs:string', value: JSON.stringify(node.responsiblePartnerIds ?? []) },
        { modelType: 'Property', idShort: 'responsiblePartner', valueType: 'xs:string', value: node.responsiblePartner ?? '' },
        ...(node.gateway
          ? [{ modelType: 'Property', idShort: 'gatewayLogic', valueType: 'xs:string', value: node.gateway.logic }]
          : []),
        { modelType: 'Property', idShort: 'positionX', valueType: 'xs:float', value: String(node.position?.x ?? 0) },
        { modelType: 'Property', idShort: 'positionY', valueType: 'xs:float', value: String(node.position?.y ?? 0) },
        {
          modelType: 'SubmodelElementCollection',
          idShort: 'inputs',
          value: inputs.map((inp, i) => {
            const src = inp.source
            const sourceDescriptor =
              src.kind === 'PREDECESSOR'
                ? `${src.kind}:${src.from.nodeId}.${src.from.outputId}`
                : src.kind === 'DATASOURCE'
                  ? `${src.kind}:${src.dataSourceId}`
                  : src.kind
            return {
              modelType: 'SubmodelElementCollection',
              idShort: `input_${i}`,
              value: [
                { modelType: 'Property', idShort: 'id', valueType: 'xs:string', value: inp.id },
                { modelType: 'Property', idShort: 'name', valueType: 'xs:string', value: inp.name ?? inp.id },
                { modelType: 'Property', idShort: 'source', valueType: 'xs:string', value: sourceDescriptor },
                { modelType: 'Property', idShort: 'cardinality', valueType: 'xs:string', value: inp.cardinality },
                { modelType: 'Property', idShort: 'required', valueType: 'xs:boolean', value: String(inp.required) },
                { modelType: 'Property', idShort: 'fileTypes', valueType: 'xs:string', value: JSON.stringify(inp.fileTypes ?? []) },
              ],
            }
          }),
        },
        {
          modelType: 'SubmodelElementCollection',
          idShort: 'outputs',
          value: outputs.map((out, i) => ({
            modelType: 'SubmodelElementCollection',
            idShort: `output_${i}`,
            value: [
              { modelType: 'Property', idShort: 'id', valueType: 'xs:string', value: out.id },
              { modelType: 'Property', idShort: 'name', valueType: 'xs:string', value: out.name ?? out.id },
              { modelType: 'Property', idShort: 'cardinality', valueType: 'xs:string', value: out.cardinality },
              { modelType: 'Property', idShort: 'required', valueType: 'xs:boolean', value: String(out.required) },
              { modelType: 'Property', idShort: 'fileTypes', valueType: 'xs:string', value: JSON.stringify(out.fileTypes ?? []) },
            ],
          })),
        },
      ],
    }
  }

  private edgeToAnnotatedRel(edge: any) {
    return {
      modelType: 'AnnotatedRelationship',
      idShort: `edge_${edge.id.replace(/-/g, '_')}`,
      first: { type: 'ModelReference', keys: [{ type: 'SubmodelElementCollection', value: `node_${edge.source.replace(/-/g, '_')}` }] },
      second: { type: 'ModelReference', keys: [{ type: 'SubmodelElementCollection', value: `node_${edge.target.replace(/-/g, '_')}` }] },
      annotations: edge.label
        ? [{ modelType: 'Property', idShort: 'label', valueType: 'xs:string', value: edge.label }]
        : [],
    }
  }

  /** Build AAS for Node Catalog */
  nodeCatalogToAas(catalog: any[]) {
    return {
      modelType: 'AssetAdministrationShell',
      id: 'urn:digitalthread:aas:node-catalog:1.0',
      idShort: 'NodeTypeCatalog',
      assetInformation: { assetKind: 'Type', globalAssetId: 'urn:digitalthread:asset:node-catalog' },
      submodels: [{ type: 'ExternalReference', keys: [{ type: 'Submodel', value: 'urn:digitalthread:sm:node-type-catalog:1.0' }] }],
      submodelInline: [{
        modelType: 'Submodel',
        id: 'urn:digitalthread:sm:node-type-catalog:1.0',
        idShort: 'NodeTypeCatalog',
        submodelElements: catalog.map((entry) => ({
          modelType: 'SubmodelElementCollection',
          idShort: entry.nodeTypeId,
          value: [
            { modelType: 'Property', idShort: 'category', valueType: 'xs:string', value: entry.category },
            { modelType: 'Property', idShort: 'label', valueType: 'xs:string', value: entry.label },
            { modelType: 'Property', idShort: 'color', valueType: 'xs:string', value: entry.color },
            { modelType: 'Property', idShort: 'icon', valueType: 'xs:string', value: entry.icon ?? '' },
            { modelType: 'Property', idShort: 'description', valueType: 'xs:string', value: entry.description ?? '' },
            { modelType: 'Property', idShort: 'defaultPartner', valueType: 'xs:string', value: entry.defaultPartner ?? '' },
            { modelType: 'Property', idShort: 'expectedOutput', valueType: 'xs:string', value: entry.expectedOutput ?? '' },
          ],
        })),
      }],
    }
  }
}
