/**
 * semanticIds and ConceptDescription definitions of the Digital Thread
 * WorkflowDefinition submodel (the inter-organisational workflow next to the
 * per-job IDTA 02100 MWD submodels) and of the NodeTypeCatalog submodel. IRIs
 * follow docs/idta-02100/tools/clean_workflow_export.py so the export matches
 * the prototype verified with aas-core3.
 */

import type { ConceptDefinition } from './aas-core.util'

export const WF_NS = 'urn:digital-thread:submodel:WorkflowDefinition:1:0'
export const CATALOG_NS = 'urn:digital-thread:submodel:NodeTypeCatalog:1:0'

export function wfSem(...parts: string[]): string {
  return parts.length ? `${WF_NS}/${parts.join('/')}` : WF_NS
}

export function catalogSem(...parts: string[]): string {
  return parts.length ? `${CATALOG_NS}/${parts.join('/')}` : CATALOG_NS
}

export function workflowSubmodelId(machineId: string): string {
  return `urn:digitalthread:sm:workflow-def:${machineId}`
}

export function machineShellId(machineId: string): string {
  return `urn:digitalthread:aas:machine:${machineId}`
}

export function workflowAssetId(machineId: string): string {
  return `urn:digitalthread:asset:workflow:${machineId}`
}

const d = (idShort: string, definition: string): ConceptDefinition => ({ idShort, definition })

function portDefinitions(kind: 'Input' | 'Output'): Record<string, ConceptDefinition> {
  const low = kind.toLowerCase()
  const out: Record<string, ConceptDefinition> = {
    [wfSem('Node', `${kind}s`)]: d(`${kind}s`, `File contract: ${low}s of the node`),
    [wfSem('Node', kind)]: d(kind, `${kind} of the file contract of a workflow node`),
    [wfSem('Node', kind, 'id')]: d('id', `Identifier of the ${low} within the node`),
    [wfSem('Node', kind, 'name')]: d('name', `Human readable name of the ${low}`),
    [wfSem('Node', kind, 'cardinality')]: d('cardinality', 'ONE or MANY files'),
    [wfSem('Node', kind, 'required')]: {
      idShort: 'required', definition: 'Whether the file is required for the node to complete', dataType: 'BOOLEAN',
    },
    [wfSem('Node', kind, 'fileTypes')]: d('fileTypes', 'JSON array of accepted file extensions'),
  }
  if (kind === 'Input') {
    out[wfSem('Node', 'Input', 'source')] = d('source',
      'MANUAL (uploaded by the responsible partner), DATASOURCE:<dataSourceId>, or PREDECESSOR:<nodeId>.<outputId>')
    out[wfSem('Node', 'Input', 'sourceRef')] = d('sourceRef', 'Model reference to the predecessor output feeding this input')
  }
  return out
}

export const WF_DEFINITIONS: Record<string, ConceptDefinition> = {
  [WF_NS]: d('WorkflowDefinition',
    'Digital Thread workflow definition: nodes (trigger, task, gateway) with file contracts, directed edges and stage groups'),
  [wfSem('workflowName')]: d('workflowName', 'Name of the workflow'),
  [wfSem('version')]: d('version', 'Version of the workflow head'),
  [wfSem('tags')]: d('tags', 'JSON array of free tags'),
  [wfSem('Node')]: d('Node', 'A step of the workflow: trigger, task or gateway, with its file contract'),
  [wfSem('Node', 'nodeId')]: d('nodeId', 'Unique identifier of the node within the workflow'),
  [wfSem('Node', 'kind')]: d('kind', 'TRIGGER, TASK or GATEWAY'),
  [wfSem('Node', 'nodeCategory')]: d('nodeCategory',
    'Legacy node category (TRIGGER, AUTOMATIC, MANUAL, GATEWAY, STORAGE) kept for older consumers'),
  [wfSem('Node', 'nodeTypeId')]: d('nodeTypeId', 'Legacy node type identifier from the Digital Thread node catalog'),
  [wfSem('Node', 'name')]: d('name', 'Name of the workflow step'),
  [wfSem('Node', 'description')]: d('description', 'Description of the workflow step'),
  [wfSem('Node', 'tags')]: d('tags', 'JSON array of free tags'),
  [wfSem('Node', 'responsiblePartner')]: d('responsiblePartner',
    'Legacy name of the organisation responsible for the step'),
  [wfSem('Node', 'responsiblePartnerId')]: d('responsiblePartnerId',
    'Digital Thread partner id of the primary organisation responsible for the step'),
  [wfSem('Node', 'responsiblePartnerIds')]: d('responsiblePartnerIds',
    'JSON array of Digital Thread partner ids responsible for the step'),
  [wfSem('Node', 'gatewayLogic')]: d('gatewayLogic', 'AND, OR or XOR evaluation of the incoming files'),
  [wfSem('Node', 'groupId')]: d('groupId', 'Id of the stage group the node belongs to'),
  [wfSem('Node', 'workDescription')]: d('workDescription',
    'Model reference to the IDTA 02100 Manufacturing Work Description submodel of this task'),
  ...portDefinitions('Input'),
  ...portDefinitions('Output'),
  [wfSem('Edge')]: d('Edge', 'Directed edge between two workflow nodes'),
  [wfSem('Edge', 'edgeId')]: d('edgeId', 'Identifier of the edge within the workflow'),
  [wfSem('Edge', 'label')]: d('label', 'Label shown on the edge'),
  [wfSem('Groups')]: d('Groups', 'Stage groups of the workflow'),
  [wfSem('Group')]: d('Group', 'Group of nodes, typically one supply-chain stage'),
  [wfSem('Group', 'groupId')]: d('groupId', 'Group identifier'),
  [wfSem('Group', 'name')]: d('name', 'Group name'),
  [wfSem('Group', 'nodeIds')]: d('nodeIds', 'JSON array of member node ids'),
}

export const CATALOG_DEFINITIONS: Record<string, ConceptDefinition> = {
  [CATALOG_NS]: d('NodeTypeCatalog', 'Digital Thread catalog of node types available in the workflow editor'),
  [catalogSem('NodeType')]: d('NodeType', 'One node type of the catalog'),
  [catalogSem('NodeType', 'nodeTypeId')]: d('nodeTypeId', 'Identifier of the node type'),
  [catalogSem('NodeType', 'category')]: d('category', 'TRIGGER, AUTOMATIC, MANUAL, GATEWAY or STORAGE'),
  [catalogSem('NodeType', 'label')]: d('label', 'Display label of the node type'),
  [catalogSem('NodeType', 'color')]: d('color', 'Editor colour of the node type'),
  [catalogSem('NodeType', 'icon')]: d('icon', 'Editor icon name of the node type'),
  [catalogSem('NodeType', 'description')]: d('description', 'Description of the node type'),
  [catalogSem('NodeType', 'defaultPartner')]: d('defaultPartner', 'Partner that usually performs this node type'),
  [catalogSem('NodeType', 'expectedOutput')]: d('expectedOutput', 'Typical output file of the node type'),
}
