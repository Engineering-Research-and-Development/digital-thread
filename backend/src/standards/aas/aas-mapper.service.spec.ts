/**
 * Type-level AAS export (GET /aas/machines/:id): AAS 3.0 Environment with the
 * WorkflowDefinition submodel and one IDTA 02100 Manufacturing Work
 * Description per TASK node. US1 = Type-level export.
 */
import { AasMapperService } from './aas-mapper.service'
import { collectSemanticIds, findElement, propValue, refTarget } from './aas-core.util'
import { isMwdSubmodel } from './mwd-mapper'
import { MWD_ROOT, MWD_TEMPLATE_ID } from './mwd-spec'
import { WF_NS } from './workflow-def-spec'
import { NODE_CATALOG } from '@/standards/node-catalog.data'
import { MWD_MACHINE } from './aas-test.fixture'

/** Depth-first walk over every element (Submodel children, SMC/SML values, annotations). */
function walk(el: any, visit: (e: any, parent: any) => void, parent: any = null) {
  if (!el || typeof el !== 'object') return
  visit(el, parent)
  for (const child of [...(el.submodelElements ?? []), ...(Array.isArray(el.value) ? el.value : []), ...(el.annotations ?? [])]) {
    if (child && typeof child === 'object' && child.modelType) walk(child, visit, el)
  }
}

describe('AasMapperService.machineToAas (US1 Type-level export)', () => {
  const mapper = new AasMapperService()
  const env = mapper.machineToAas(MWD_MACHINE)
  const shell = env.assetAdministrationShells[0]
  const wf: any = env.submodels.find((sm: any) => sm.idShort === 'WorkflowDefinition')
  const mwds = env.submodels.filter(isMwdSubmodel)
  const mwdOf = (nodeId: string) => mwds.find((sm: any) => propValue(sm, 'ID') === nodeId)!

  it('US1/AS1: returns a standard AAS 3.0 Environment, not the legacy envelope', () => {
    expect(Object.keys(env).sort()).toEqual(['assetAdministrationShells', 'conceptDescriptions', 'submodels'])
    expect((env as any).modelType).toBeUndefined()
    expect((env as any).submodelInline).toBeUndefined()
    expect(shell).toMatchObject({
      modelType: 'AssetAdministrationShell',
      id: 'urn:digitalthread:aas:machine:m-mwd-1',
      idShort: 'MWD_Demo',
      assetInformation: { assetKind: 'Type', globalAssetId: 'urn:digitalthread:asset:workflow:m-mwd-1' },
    })
    // The shell references every submodel of the Environment with a ModelReference.
    expect(shell.submodels.map((r: any) => r.type)).toEqual(env.submodels.map(() => 'ModelReference'))
    expect(shell.submodels.map((r: any) => r.keys[0])).toEqual(env.submodels.map((sm: any) => ({ type: 'Submodel', value: sm.id })))
  })

  it('US1/AS2: emits one MWD per TASK node and none for TRIGGER / GATEWAY nodes', () => {
    expect(mwds.map((sm: any) => sm.id).sort()).toEqual([
      'urn:digitalthread:sm:mwd:m-mwd-1:n-atl',
      'urn:digitalthread:sm:mwd:m-mwd-1:n-ndi',
    ])
    expect(mwdOf('n-atl').idShort).toBe('MWD_n_atl')
    // the gateway carries `work` in storage but is not a job
    expect(mwds.some((sm: any) => propValue(sm, 'ID') === 'n-gw')).toBe(false)
    // each TASK node SMC points at its MWD; the others do not
    const nodeSmc = (nodeId: string) => findElement(wf, `node_${nodeId.replace(/-/g, '_')}`)
    expect(refTarget(nodeSmc('n-atl'), 'workDescription')).toBe('urn:digitalthread:sm:mwd:m-mwd-1:n-atl')
    expect(findElement(nodeSmc('n-atl'), 'workDescription').value.type).toBe('ModelReference')
    expect(findElement(nodeSmc('n-trigger'), 'workDescription')).toBeUndefined()
    expect(findElement(nodeSmc('n-gw'), 'workDescription')).toBeUndefined()
  })

  it('US1/AS3: fills the MWD root from the node, the machine and the work description', () => {
    const atl = mwdOf('n-atl')
    expect(atl).toMatchObject({
      modelType: 'Submodel',
      kind: 'Instance',
      semanticId: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: MWD_ROOT }] },
      administration: { templateId: MWD_TEMPLATE_ID },
    })
    expect(propValue(atl, 'ID')).toBe('n-atl')
    expect(propValue(atl, 'Version')).toBe('2.0.0')
    expect(findElement(atl, 'Description')).toMatchObject({ modelType: 'MultiLanguageProperty', value: [{ language: 'en', text: 'Automated tape laying' }] })
    expect(propValue(atl, 'HierarchyScope')).toBe('AIM automated composite manufacturing cell')
    expect(propValue(atl, 'WorkType')).toBe('production')
    expect(propValue(atl, 'Duration')).toBe('4')
    expect(propValue(atl, 'DurationUnit')).toBe('h')
    expect(findElement(atl, 'PublishedDate')).toMatchObject({ valueType: 'xs:dateTime', value: '2026-01-02T03:04:05.000Z' })
    expect(propValue(atl, 'DefinitionType')).toBe('pattern')

    // No work: Description falls back to the name, HierarchyScope to the primary partner.
    const ndi = mwdOf('n-ndi')
    expect(findElement(ndi, 'Description').value[0].text).toBe('NDI inspection')
    expect(propValue(ndi, 'HierarchyScope')).toBe('p-imd')
    expect(propValue(ndi, 'WorkType')).toBe('production')
    expect(findElement(ndi, 'Duration')).toBeUndefined()
  })

  it('US1/AS4: lays the specification lists out as in mwd_spec (SML items without idShort, semanticIds everywhere)', () => {
    const atl = mwdOf('n-atl')
    const listIds = atl.submodelElements.filter((e: any) => e.modelType === 'SubmodelElementList').map((e: any) => e.idShort)
    expect(listIds).toEqual(['ParameterSpecifications', 'PersonnelSpecifications', 'EquipmentSpecifications', 'MaterialSpecifications'])
    expect(findElement(atl, 'PhysicalAssetSpecifications')).toBeUndefined() // empty list omitted entirely

    const params = findElement(atl, 'ParameterSpecifications')
    expect(params).toMatchObject({
      typeValueListElement: 'SubmodelElementCollection',
      orderRelevant: false,
      semanticIdListElement: { keys: [{ value: `${MWD_ROOT}/ParameterSpecifications/ParameterSpecification` }] },
    })
    expect(params.value).toHaveLength(2)
    for (const item of params.value) expect(item.idShort).toBeUndefined() // AASd-120
    expect(propValue(params.value[0], 'ID')).toBe('nozzleTemp')
    expect(findElement(params.value[0], 'Description').value[0].text).toBe('Nozzle temperature')
    expect(propValue(params.value[0], 'Value')).toBe('380')
    expect(propValue(params.value[0], 'ValueUnit')).toBe('degC')
    // ValueUnit has cardinality One: present even without a value, never ''
    expect(findElement(params.value[1], 'ValueUnit')).toBeDefined()
    expect(findElement(params.value[1], 'ValueUnit').value).toBeUndefined()
    expect(findElement(params.value[1], 'Description')).toBeUndefined() // ZeroToOne, no value → omitted

    const equipment = findElement(atl, 'EquipmentSpecifications').value[0]
    expect(equipment.idShort).toBeUndefined()
    expect(findElement(equipment, 'EquipmentClass')).toMatchObject({
      modelType: 'ReferenceElement',
      value: { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: 'urn:compstlar:equipment-class:atl-cell' }] },
    })
    expect(refTarget(equipment, 'Equipment')).toBe('urn:compstlar:equipment:atl-cell-01')
    expect(propValue(equipment, 'EquipmentUse')).toBe('production')
    const specProps = equipment.value.filter((e: any) => e.modelType === 'SubmodelElementCollection').map((e: any) => e.idShort)
    expect(specProps).toEqual(['EquipmentSpecificationProperty', 'EquipmentSpecificationProperty01'])
    expect(propValue(findElement(equipment, 'EquipmentSpecificationProperty01'), 'Quantity')).toBe('2')

    const material = findElement(atl, 'MaterialSpecifications').value[0]
    expect(propValue(material, 'AssemblyType')).toBe('physical')
    expect(propValue(material, 'AssemblyRelationship')).toBe('permanent')
    expect(findElement(material, 'MaterialDefinition')).toBeDefined() // cardinality One, unknown target
    expect(findElement(material, 'MaterialDefinition').value).toBeUndefined()

    // Every element below the MWDs and the WorkflowDefinition carries a semanticId.
    const missing: string[] = []
    for (const sm of env.submodels) {
      walk(sm, (e, parent) => {
        if (!e.semanticId?.keys?.[0]?.value) missing.push(`${parent?.idShort ?? sm.idShort}/${e.idShort ?? e.modelType}`)
      })
    }
    expect(missing).toEqual([])
  })

  it('US1/AS5: derives one PersonnelSpecification per responsible partner when no personnel is authored', () => {
    const ndi = mwdOf('n-ndi')
    const items = findElement(ndi, 'PersonnelSpecifications').value
    expect(items.map((i: any) => refTarget(i, 'PersonnelClass'))).toEqual([
      'urn:digitalthread:partner:p-imd',
      'urn:digitalthread:partner:p-ens',
    ])
    for (const item of items) {
      expect(propValue(item, 'PersonnelUse')).toBe('responsible partner')
      expect(findElement(item, 'Person').value).toBeUndefined()
    }
    // authored personnel wins over the derivation
    const atl = findElement(mwdOf('n-atl'), 'PersonnelSpecifications').value
    expect(atl).toHaveLength(1)
    expect(refTarget(atl[0], 'PersonnelClass')).toBe('urn:compstlar:personnel-class:atl-operator')
  })

  it('US1/AS6: never emits an empty value, and omits PublishedDate when the date is unknown', () => {
    const empties: string[] = []
    for (const sm of env.submodels) {
      walk(sm, (e) => {
        if (e.modelType === 'Property' && e.value === '') empties.push(e.idShort)
        if (e.modelType === 'Property' && e.valueType === 'xs:dateTime' && !e.value) empties.push(`${e.idShort}(dateTime)`)
        if (e.modelType === 'MultiLanguageProperty' && Array.isArray(e.value) && e.value.length === 0) empties.push(e.idShort)
      })
    }
    expect(empties).toEqual([])

    const undated = mapper.machineToAas({ ...MWD_MACHINE, updatedAt: undefined })
    const mwd = undated.submodels.filter(isMwdSubmodel)[0]
    expect(findElement(mwd, 'PublishedDate')).toBeUndefined()
    expect(findElement(mapper.machineToAas({ ...MWD_MACHINE, updatedAt: 'not a date' }).submodels[1], 'PublishedDate')).toBeUndefined()
  })

  it('US1/AS7: keeps the WorkflowDefinition content but standard (semanticIds, AnnotatedRelationshipElement, no layout)', () => {
    expect(wf).toMatchObject({
      id: 'urn:digitalthread:sm:workflow-def:m-mwd-1',
      kind: 'Instance',
      semanticId: { keys: [{ value: WF_NS }] },
    })
    expect(propValue(wf, 'workflowName')).toBe('MWD Demo')
    expect(propValue(wf, 'version')).toBe('2.0.0')
    expect(propValue(wf, 'tags')).toBe('["demo"]')

    const edges: any[] = wf.submodelElements.filter((e: any) => e.modelType === 'AnnotatedRelationshipElement')
    expect(wf.submodelElements.some((e: any) => e.modelType === 'AnnotatedRelationship')).toBe(false)
    expect(edges).toHaveLength(3)
    expect(edges[0]).toMatchObject({
      idShort: 'edge_e_1',
      first: { type: 'ModelReference', keys: [{ type: 'Submodel', value: wf.id }, { type: 'SubmodelElementCollection', value: 'node_n_trigger' }] },
      second: { type: 'ModelReference', keys: [{ type: 'Submodel', value: wf.id }, { type: 'SubmodelElementCollection', value: 'node_n_atl' }] },
    })
    expect(propValue({ value: edges[0].annotations }, 'edgeId')).toBe('e-1')
    expect(propValue({ value: edges[0].annotations }, 'label')).toBe('released')
    expect(propValue({ value: edges[2].annotations }, 'edgeId')).toBe('n-gw-n-ndi') // id-less edge

    const idShorts: string[] = []
    walk(wf, (e) => { if (e.idShort) idShorts.push(e.idShort) })
    expect(idShorts).not.toContain('positionX')
    expect(idShorts).not.toContain('positionY')
    expect(idShorts).not.toContain('color')
    const group = findElement(findElement(wf, 'groups'), 'group_0')
    expect(propValue(group, 'groupId')).toBe('g-mfg')
    expect(propValue(group, 'nodeIds')).toBe('["n-atl"]')

    // inputs keep the source descriptor and gain a model reference to the predecessor output
    const atl = findElement(wf, 'node_n_atl')
    const input0 = findElement(findElement(atl, 'inputs'), 'input_0')
    expect(propValue(input0, 'source')).toBe('PREDECESSOR:n-trigger.cad')
    expect(findElement(input0, 'sourceRef').value.keys.map((k: any) => k.value)).toEqual([wf.id, 'node_n_trigger', 'outputs', 'output_0'])
    expect(propValue(findElement(findElement(atl, 'inputs'), 'input_1'), 'source')).toBe('DATASOURCE:ds-1')
    expect(findElement(input0, 'required')).toMatchObject({ valueType: 'xs:boolean', value: 'true' })
  })

  it('US1/AS8: includes one ConceptDescription per distinct semanticId used', () => {
    const used = [...collectSemanticIds(env.submodels)].sort()
    const cdIds = env.conceptDescriptions.map((cd: any) => cd.id)
    expect(cdIds).toEqual(used)
    expect(new Set(cdIds).size).toBe(cdIds.length)
    const root = env.conceptDescriptions.find((cd: any) => cd.id === MWD_ROOT)!
    expect(root).toMatchObject({
      modelType: 'ConceptDescription',
      idShort: 'ManufacturingWorkDescription',
      embeddedDataSpecifications: [{
        dataSpecificationContent: {
          modelType: 'DataSpecificationIec61360',
          definition: [{ language: 'en', text: expect.stringContaining('personnel, equipment, physical asset and material') }],
        },
      }],
    })
    expect(env.conceptDescriptions.find((cd: any) => cd.id === `${MWD_ROOT}/PublishedDate`)!.embeddedDataSpecifications[0].dataSpecificationContent.dataType).toBe('DATE')
  })

  it('US1/AS9: produces the same Environment for a deserialised machine (arrays) and a raw row (JSON strings)', () => {
    const deserialised = {
      ...MWD_MACHINE,
      nodes: JSON.parse(MWD_MACHINE.nodesJson), edges: JSON.parse(MWD_MACHINE.edgesJson), groups: JSON.parse(MWD_MACHINE.groupsJson),
      tags: JSON.parse(MWD_MACHINE.tags), nodesJson: undefined, edgesJson: undefined, groupsJson: undefined,
    }
    expect(JSON.stringify(mapper.machineToAas(deserialised))).toBe(JSON.stringify(env))
  })

  it('US1/AS11: exports one task node as an Environment holding exactly the MWD of the full export', () => {
    const single = mapper.nodeMwdToAas(MWD_MACHINE, 'n-atl')!
    expect(Object.keys(single).sort()).toEqual(['conceptDescriptions', 'submodels']) // no empty shells list
    expect(JSON.stringify(single.submodels[0])).toBe(JSON.stringify(mwdOf('n-atl')))
    expect(single.conceptDescriptions.map((cd: any) => cd.id)).toEqual([...collectSemanticIds(single.submodels)].sort())
    expect(mapper.nodeMwdToAas(MWD_MACHINE, 'n-gw')).toBeNull()
    expect(mapper.nodeMwdToAas(MWD_MACHINE, 'n-trigger')).toBeNull()
    expect(mapper.nodeMwdToAas(MWD_MACHINE, 'missing')).toBeNull()
  })

  it('US1/AS10: exports the node catalog as an Environment too', () => {
    const catalog = mapper.nodeCatalogToAas(NODE_CATALOG)
    expect(Object.keys(catalog).sort()).toEqual(['assetAdministrationShells', 'conceptDescriptions', 'submodels'])
    expect(catalog.submodels[0].submodelElements).toHaveLength(NODE_CATALOG.length)
    expect(catalog.assetAdministrationShells[0].submodels[0].keys[0].value).toBe(catalog.submodels[0].id)
    expect(catalog.conceptDescriptions.length).toBeGreaterThan(0)
  })
})
