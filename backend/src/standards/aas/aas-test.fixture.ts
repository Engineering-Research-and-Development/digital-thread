/**
 * Shared fixtures for the IDTA 02100 / AAS Environment unit tests. Not a spec
 * file (jest only collects `*.spec.ts`).
 */

/** Machine as it comes from Prisma (`*Json` strings), with every node kind and a rich `work`. */
export const MWD_MACHINE = {
  id: 'm-mwd-1',
  name: 'MWD Demo',
  version: '2.0.0',
  description: 'Machine used by the IDTA 02100 tests',
  updatedAt: new Date('2026-01-02T03:04:05.000Z'),
  tags: '["demo"]',
  nodesJson: JSON.stringify([
    {
      id: 'n-trigger', kind: 'TRIGGER', name: 'Design release',
      outputs: [{ id: 'cad', name: 'CAD model', cardinality: 'ONE', required: true, fileTypes: ['.step'] }],
      position: { x: 0, y: 0 },
    },
    {
      id: 'n-atl', kind: 'TASK', name: 'ATL processing', description: 'Automated tape laying',
      tags: ['manufacturing'], responsiblePartnerIds: ['p-aim'], groupId: 'g-mfg',
      inputs: [
        { id: 'in-cad', name: 'CAD model', cardinality: 'ONE', required: true, fileTypes: ['.step'], source: { kind: 'PREDECESSOR', from: { nodeId: 'n-trigger', outputId: 'cad' } } },
        { id: 'in-params', name: 'Process parameters', cardinality: 'MANY', required: false, fileTypes: ['.json'], source: { kind: 'DATASOURCE', dataSourceId: 'ds-1' } },
      ],
      outputs: [{ id: 'out-laminate', name: 'Laminate report', cardinality: 'ONE', required: true, fileTypes: ['.pdf'] }],
      position: { x: 300, y: 0 },
      work: {
        hierarchyScope: 'AIM automated composite manufacturing cell',
        workType: 'production',
        duration: '4',
        durationUnit: 'h',
        parameters: [
          { id: 'nozzleTemp', description: 'Nozzle temperature', value: '380', valueUnit: 'degC' },
          { id: 'layupSpeed', value: '0.5' },
        ],
        personnel: [
          { id: 'per-a1', classRef: 'urn:compstlar:personnel-class:atl-operator', description: 'ATL machine operator', use: 'operation', quantity: '1', quantityUnit: 'person' },
        ],
        equipment: [
          {
            id: 'eq-x9', classRef: 'urn:compstlar:equipment-class:atl-cell', objectRef: 'urn:compstlar:equipment:atl-cell-01',
            description: 'ATL cell', use: 'production', quantity: '1', quantityUnit: 'unit',
            properties: [
              { id: 'maxTapeWidth', value: '300', valueUnit: 'mm' },
              { id: 'heads', description: 'Laying heads', value: '2', quantity: '2', quantityUnit: 'unit' },
            ],
          },
        ],
        materials: [
          { id: 'mat-tape', classRef: 'urn:compstlar:material-class:cf-gr-tp-ud-tape', use: 'Consumed', quantity: '12', quantityUnit: 'kg', assemblyType: 'physical', assemblyRelationship: 'permanent' },
        ],
      },
    },
    {
      // `work` on a gateway is tolerated in storage but ignored by the exporters.
      id: 'n-gw', kind: 'GATEWAY', name: 'All reports', gateway: { logic: 'AND' },
      inputs: [{ id: 'in-rep', name: 'Laminate report', cardinality: 'ONE', required: true, fileTypes: ['.pdf'], source: { kind: 'PREDECESSOR', from: { nodeId: 'n-atl', outputId: 'out-laminate' } } }],
      outputs: [],
      position: { x: 600, y: 0 },
      work: { workType: 'quality' },
    },
    {
      // No `work`: personnel is derived from the responsible partners.
      id: 'n-ndi', kind: 'TASK', name: 'NDI inspection', responsiblePartnerIds: ['p-imd', 'p-ens'],
      inputs: [{ id: 'in-lam', name: 'Laminate report', cardinality: 'ONE', required: true, fileTypes: ['.pdf'], source: { kind: 'MANUAL' } }],
      outputs: [{ id: 'out-ndi', name: 'NDI report', cardinality: 'ONE', required: false, fileTypes: ['.pdf', '.json'] }],
      position: { x: 900, y: 0 },
    },
  ]),
  edgesJson: JSON.stringify([
    { id: 'e-1', source: 'n-trigger', target: 'n-atl', label: 'released' },
    { id: 'e-2', source: 'n-atl', target: 'n-gw' },
    { source: 'n-gw', target: 'n-ndi' }, // edges of older machines have no id
  ]),
  groupsJson: JSON.stringify([{ id: 'g-mfg', name: 'Manufacturing', color: '#F59E0B', nodeIds: ['n-atl'] }]),
}

/** Shape (b): the pre-Environment Digital Thread envelope (what the old exporter produced). */
export const LEGACY_ENVELOPE = {
  modelType: 'AssetAdministrationShell',
  id: 'urn:digitalthread:aas:machine:legacy-1',
  idShort: 'Legacy_Flow',
  assetInformation: { assetKind: 'Type', globalAssetId: 'urn:digitalthread:asset:workflow:legacy-1' },
  description: [{ language: 'en', text: 'Legacy export' }],
  submodels: [{ type: 'ExternalReference', keys: [{ type: 'Submodel', value: 'urn:digitalthread:sm:workflow-def:legacy-1' }] }],
  submodelInline: [
    {
      modelType: 'Submodel',
      id: 'urn:digitalthread:sm:workflow-def:legacy-1',
      idShort: 'WorkflowDefinition',
      submodelElements: [
        { modelType: 'Property', idShort: 'workflowName', valueType: 'xs:string', value: 'Legacy flow' },
        { modelType: 'Property', idShort: 'version', valueType: 'xs:string', value: '0.9.0' },
        { modelType: 'Property', idShort: 'tags', valueType: 'xs:string', value: '["old"]' },
        {
          modelType: 'SubmodelElementCollection', idShort: 'node_a_1',
          value: [
            { modelType: 'Property', idShort: 'nodeId', valueType: 'xs:string', value: 'a-1' },
            { modelType: 'Property', idShort: 'kind', valueType: 'xs:string', value: 'TRIGGER' },
            { modelType: 'Property', idShort: 'name', valueType: 'xs:string', value: 'Start' },
            { modelType: 'Property', idShort: 'positionX', valueType: 'xs:float', value: '10' },
            { modelType: 'Property', idShort: 'positionY', valueType: 'xs:float', value: '20' },
            { modelType: 'SubmodelElementCollection', idShort: 'inputs', value: [] },
            { modelType: 'SubmodelElementCollection', idShort: 'outputs', value: [] },
          ],
        },
        {
          modelType: 'SubmodelElementCollection', idShort: 'node_b_2',
          value: [
            { modelType: 'Property', idShort: 'nodeId', valueType: 'xs:string', value: 'b-2' },
            { modelType: 'Property', idShort: 'nodeCategory', valueType: 'xs:string', value: 'MANUAL' },
            { modelType: 'Property', idShort: 'nodeTypeId', valueType: 'xs:string', value: 'NDI_INSPECTION' },
            { modelType: 'Property', idShort: 'label', valueType: 'xs:string', value: 'Inspect' },
            { modelType: 'Property', idShort: 'responsiblePartner', valueType: 'xs:string', value: 'IMD' },
            { modelType: 'Property', idShort: 'positionX', valueType: 'xs:float', value: '310' },
            { modelType: 'Property', idShort: 'positionY', valueType: 'xs:float', value: '20' },
            { modelType: 'SubmodelElementCollection', idShort: 'inputs', value: [] },
            { modelType: 'SubmodelElementCollection', idShort: 'outputs', value: [] },
          ],
        },
        {
          modelType: 'AnnotatedRelationship',
          idShort: 'edge_e_7',
          first: { type: 'ModelReference', keys: [{ type: 'SubmodelElementCollection', value: 'node_a_1' }] },
          second: { type: 'ModelReference', keys: [{ type: 'SubmodelElementCollection', value: 'node_b_2' }] },
          annotations: [{ modelType: 'Property', idShort: 'label', valueType: 'xs:string', value: 'go' }],
        },
      ],
    },
  ],
}

const MWD = 'https://admin-shell.io/idta/ManufacturingWorkDescription/1/0'
const ext = (v: string) => ({ type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: v }] })
const P = (idShort: string, value: string, sem?: string) => ({
  modelType: 'Property', idShort, valueType: 'xs:string', value, ...(sem ? { semanticId: ext(sem) } : {}),
})
const M = (idShort: string, text: string) => ({ modelType: 'MultiLanguageProperty', idShort, value: [{ language: 'en', text }] })
const R = (idShort: string, target?: string) => ({ modelType: 'ReferenceElement', idShort, ...(target ? { value: ext(target) } : {}) })

/**
 * Shape (c): a partner's MWD instances exported to JSON, no WorkflowDefinition.
 * The second submodel uses the UCB v3 AASX variants the reader must tolerate:
 * lists as SMCs, singular list idShort, items with `_00` idShorts, a space in
 * 'Assembly Relationship', no semanticIds, Description as a plain Property.
 */
export const MWD_ONLY_ENVIRONMENT = {
  assetAdministrationShells: [
    {
      modelType: 'AssetAdministrationShell',
      id: 'urn:x:aas:ucb-jobs',
      idShort: 'UCB_Jobs',
      assetInformation: { assetKind: 'Type', globalAssetId: 'urn:x:asset:ucb-jobs' },
      submodels: [
        { type: 'ModelReference', keys: [{ type: 'Submodel', value: 'urn:x:mwd:repair' }] },
        { type: 'ModelReference', keys: [{ type: 'Submodel', value: 'urn:x:mwd:tapes' }] },
      ],
    },
  ],
  submodels: [
    {
      modelType: 'Submodel',
      id: 'urn:x:mwd:repair',
      idShort: 'ManufacturingWorkDescription',
      kind: 'Instance',
      semanticId: ext(MWD),
      submodelElements: [
        P('ID', 'urn:x:workstep:repair', `${MWD}/ID`),
        P('Version', '0.3.0', `${MWD}/Version`),
        M('Description', 'Repair application'),
        P('HierarchyScope', 'NTNU repair laboratory', `${MWD}/HierarchyScope`),
        P('WorkType', 'maintenance', `${MWD}/WorkType`),
        P('PublishedDate', '2026-11-25T11:37:59Z', `${MWD}/PublishedDate`),
        P('DefinitionType', 'pattern', `${MWD}/DefinitionType`),
        {
          modelType: 'SubmodelElementList', idShort: 'ParameterSpecifications', semanticId: ext(`${MWD}/ParameterSpecifications`),
          typeValueListElement: 'SubmodelElementCollection', orderRelevant: false,
          value: [
            { modelType: 'SubmodelElementCollection', value: [P('ID', 'cureTemp'), M('Description', 'Cure temperature'), P('Value', '180'), P('ValueUnit', 'degC')] },
          ],
        },
        {
          modelType: 'SubmodelElementList', idShort: 'PersonnelSpecifications', semanticId: ext(`${MWD}/PersonnelSpecifications`),
          typeValueListElement: 'SubmodelElementCollection', orderRelevant: false,
          value: [
            { modelType: 'SubmodelElementCollection', value: [R('PersonnelClass', 'urn:x:personnel-class:repair-technician'), R('Person'), M('Description', 'Composite repair technician'), P('PersonnelUse', 'execution'), P('Quantity', '1'), P('QuantityUnit', 'unit')] },
            // Derived by a Digital Thread export: becomes a responsible partner, not personnel.
            { modelType: 'SubmodelElementCollection', value: [R('PersonnelClass', 'urn:digitalthread:partner:p-ntnu'), R('Person'), P('PersonnelUse', 'responsible partner'), P('Quantity', ''), P('QuantityUnit', '')] },
          ],
        },
      ],
    },
    {
      modelType: 'Submodel',
      id: 'urn:x:mwd:tapes',
      idShort: 'MWD_tapes',
      submodelElements: [
        P('ID', 'urn:x:workstep:tapes'),
        P('Description', 'CF/Gr-TP tapes fabrication'),
        P('WorkType', 'Production'),
        {
          modelType: 'SubmodelElementCollection', idShort: 'EquipmentSpecification',
          value: [
            {
              modelType: 'SubmodelElementCollection', idShort: 'EquipmentSpecification_00',
              value: [R('EquipmentClass', 'urn:x:equipment-class:ud-tape-line'), R('Equipment', 'urn:x:equipment:line-7'), P('EquipmentUse', 'production'), P('Quantity', '1'), P('QuantityUnit', 'unit')],
            },
          ],
        },
        {
          modelType: 'SubmodelElementCollection', idShort: 'MaterialSpecifications',
          value: [
            {
              modelType: 'SubmodelElementCollection', idShort: 'MaterialSpecification_00',
              value: [
                R('MaterialClass', 'urn:x:material-class:carbon-fibre'), R('MaterialDefinition'),
                P('MaterialUse', 'Consumed'), P('Quantity', '40'), P('QuantityUnit', 'kg'),
                P('AssemblyType', 'Physical'), P('Assembly Relationship', 'Transient'),
                { modelType: 'SubmodelElementCollection', idShort: 'MaterialSpecificationProperty', value: [P('ID', 'tow'), P('Value', '12K')] },
                { modelType: 'SubmodelElementCollection', idShort: 'MaterialSpecificationProperty01', value: [P('ID', 'sizing'), P('Value', 'epoxy-compatible')] },
              ],
            },
          ],
        },
      ],
    },
  ],
  conceptDescriptions: [],
}
