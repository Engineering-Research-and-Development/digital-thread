/**
 * AAS import (POST /aas/import) and validation (POST /aas/validate) for the
 * three accepted shapes, plus the machine → export → import round trip.
 * US3 = Import.
 */
import { BadRequestException } from '@nestjs/common'
import { AasImporterService } from './aas-importer.service'
import { AasMapperService } from './aas-mapper.service'
import { validateAas } from '../validation/aas-validator'
import { normalizeFlowNode, normalizeNodesJson } from '@/iterations/normalize-node'
import type { WorkDescriptionDef, WorkResourceSpec } from '@/iterations/types/flow-node'
import { LEGACY_ENVELOPE, MWD_MACHINE, MWD_ONLY_ENVIRONMENT } from './aas-test.fixture'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** Resource local ids are not part of IDTA 02100 and are regenerated on import. */
function withoutResourceIds(work: WorkDescriptionDef | undefined) {
  if (!work) return work
  const strip = (l?: WorkResourceSpec[]) => (l ?? []).map(({ id: _id, ...rest }) => rest)
  return {
    ...work,
    personnel: strip(work.personnel),
    equipment: strip(work.equipment),
    physicalAssets: strip(work.physicalAssets),
    materials: strip(work.materials),
  }
}

describe('AasImporterService.import (US3 Import)', () => {
  const mapper = new AasMapperService()
  const importer = new AasImporterService()

  describe('shape (a): Environment with WorkflowDefinition + MWDs', () => {
    const exported = mapper.machineToAas(MWD_MACHINE)
    const imported = importer.import(clone(exported))
    const expected = normalizeNodesJson(MWD_MACHINE.nodesJson)
    const actual = imported.nodes.map(normalizeFlowNode)
    const byId = (id: string) => actual.find((n) => n.id === id)!
    const expectedById = (id: string) => expected.find((n) => n.id === id)!

    it('US3/AS1: rebuilds the machine, nodes, inputs/outputs with their sources, edges and groups', () => {
      expect(imported.name).toBe('MWD Demo')
      expect(imported.version).toBe('2.0.0')
      expect(imported.description).toBe('Machine used by the IDTA 02100 tests')
      expect(imported.tags).toEqual(['demo'])
      expect(actual.map((n) => n.id)).toEqual(expected.map((n) => n.id))
      for (const exp of expected) {
        const act = byId(exp.id)
        expect(act.kind).toBe(exp.kind)
        expect(act.name).toBe(exp.name)
        expect(act.description ?? '').toBe(exp.description ?? '')
        expect(act.tags ?? []).toEqual(exp.tags ?? [])
        expect(act.responsiblePartnerIds).toEqual(exp.responsiblePartnerIds)
        expect(act.responsiblePartnerId).toBe(exp.responsiblePartnerId)
        expect(act.groupId).toBe(exp.groupId)
        expect(act.gateway).toEqual(exp.gateway)
        expect(act.inputs).toEqual(exp.inputs)
        expect(act.outputs.map(({ defaultClassification: _c, ...o }) => o)).toEqual(exp.outputs.map(({ defaultClassification: _c, ...o }) => o))
      }
      expect(imported.edges).toEqual([
        { id: 'e-1', source: 'n-trigger', target: 'n-atl', label: 'released' },
        { id: 'e-2', source: 'n-atl', target: 'n-gw', label: undefined },
        { id: 'n-gw-n-ndi', source: 'n-gw', target: 'n-ndi', label: undefined },
      ])
      expect(imported.groups).toEqual([{ id: 'g-mfg', name: 'Manufacturing', nodeIds: ['n-atl'] }]) // colour is layout, not exported
      // no layout in the export: a layered layout along the edges is computed
      expect(imported.nodes.map((n: any) => n.position.x)).toEqual([100, 400, 700, 1000])
    })

    it('US3/AS2: round-trips `work` of TASK nodes (deep equality after normalisation, resource ids regenerated)', () => {
      expect(withoutResourceIds(byId('n-atl').work)).toEqual(withoutResourceIds(expectedById('n-atl').work))
      expect(byId('n-atl').work!.personnel!.map((p) => p.id)).toEqual(['personnel-1'])
      expect(byId('n-atl').work!.equipment!.map((p) => p.id)).toEqual(['equipment-1'])
      expect(byId('n-atl').work!.equipment![0].properties!.map((p) => p.id)).toEqual(['maxTapeWidth', 'heads'])
      expect(byId('n-atl').work!.parameters!.map((p) => p.id)).toEqual(['nozzleTemp', 'layupSpeed'])
      // export defaults (WorkType production, HierarchyScope = primary partner, derived personnel)
      // are stripped symmetrically: a node exported without `work` imports back without `work`
      expect(byId('n-ndi').work).toBeUndefined()
      expect(imported.nodes.find((n: any) => n.id === 'n-ndi')).not.toHaveProperty('work')
      // trigger / gateway never get `work` from an import (no MWD exists for them)
      expect(byId('n-trigger').work).toBeUndefined()
      expect(byId('n-gw').work).toBeUndefined()
    })

    it('US3/AS3: re-exporting the imported machine yields the same submodels (idempotent round trip)', () => {
      const again = mapper.machineToAas({ ...imported, id: MWD_MACHINE.id, updatedAt: MWD_MACHINE.updatedAt })
      expect(JSON.stringify(again.submodels)).toBe(JSON.stringify(exported.submodels))
      expect(JSON.stringify(again.conceptDescriptions)).toBe(JSON.stringify(exported.conceptDescriptions))
    })

    it('US3/AS12: keeps an explicit workType "production" only next to another work field (documented ambiguity)', () => {
      const machine = {
        ...MWD_MACHINE,
        nodesJson: JSON.stringify([
          { id: 't-only', kind: 'TASK', name: 'Only production', outputs: [], work: { workType: 'production' } },
          { id: 't-dur', kind: 'TASK', name: 'Production with duration', outputs: [], work: { workType: 'production', duration: '1', durationUnit: 'h' } },
          { id: 't-maint', kind: 'TASK', name: 'Maintenance', outputs: [], work: { workType: 'maintenance' } },
        ]),
        edgesJson: '[]', groupsJson: '[]',
      }
      const result = importer.import(mapper.machineToAas(machine))
      const work = (id: string) => result.nodes.find((n: any) => n.id === id).work
      expect(work('t-only')).toBeUndefined() // indistinguishable from "no work" in the MWD
      expect(work('t-dur')).toMatchObject({ workType: 'production', duration: '1', durationUnit: 'h' })
      expect(work('t-maint')).toMatchObject({ workType: 'maintenance' })
    })

    it('US3/AS4: falls back to the MWD whose ID equals the node id when the workDescription reference is missing', () => {
      const doc: any = clone(exported)
      const wf = doc.submodels.find((sm: any) => sm.idShort === 'WorkflowDefinition')
      for (const el of wf.submodelElements) {
        if (Array.isArray(el.value)) el.value = el.value.filter((v: any) => v.idShort !== 'workDescription')
      }
      const result = importer.import(doc)
      const atl = result.nodes.find((n: any) => n.id === 'n-atl')
      expect(withoutResourceIds(normalizeFlowNode(atl).work)).toEqual(withoutResourceIds(expectedById('n-atl').work))
    })
  })

  describe('shape (b): legacy envelope', () => {
    it('US3/AS5: imports modelType AssetAdministrationShell + submodelInline unchanged, including AnnotatedRelationship edges and positions', () => {
      const result = importer.import(clone(LEGACY_ENVELOPE))
      expect(result.name).toBe('Legacy flow')
      expect(result.version).toBe('0.9.0')
      expect(result.tags).toEqual(['old'])
      expect(result.description).toBe('Legacy export')
      expect(result.nodes.map((n: any) => [n.id, n.position])).toEqual([
        ['a-1', { x: 10, y: 20 }],
        ['b-2', { x: 310, y: 20 }],
      ])
      expect(result.nodes[1]).toMatchObject({ type: 'MANUAL', nodeTypeId: 'NDI_INSPECTION', name: 'Inspect', responsiblePartner: 'IMD' })
      expect(result.edges).toEqual([{ id: 'e-7', source: 'a-1', target: 'b-2', label: 'go' }])
      expect(result.nodes.every((n: any) => n.work === undefined)).toBe(true)
    })
  })

  describe('shape (c): Environment with MWDs only', () => {
    const result = importer.import(clone(MWD_ONLY_ENVIRONMENT))

    it('US3/AS6: creates one TASK node per MWD, named from Description or ID, with no edges and a grid layout', () => {
      expect(result.name).toBe('UCB_Jobs')
      expect(result.version).toBe('0.3.0')
      expect(result.edges).toEqual([])
      expect(result.groups).toEqual([])
      expect(result.nodes.map((n: any) => [n.id, n.kind, n.name])).toEqual([
        ['urn:x:workstep:repair', 'TASK', 'Repair application'],
        ['urn:x:workstep:tapes', 'TASK', 'CF/Gr-TP tapes fabrication'],
      ])
      expect(result.nodes.map((n: any) => n.position)).toEqual([{ x: 100, y: 100 }, { x: 400, y: 100 }])
      for (const n of result.nodes) {
        expect(n.inputs).toEqual([])
        expect(n.outputs).toEqual([])
      }
      // the Digital Thread derived PersonnelSpecification becomes the responsible partner
      expect(result.nodes[0].responsiblePartnerIds).toEqual(['p-ntnu'])
      expect(result.nodes[1].responsiblePartnerIds).toEqual([])
      // nodes normalise cleanly (TASK gets its default output)
      expect(normalizeFlowNode(result.nodes[0]).outputs.map((o) => o.id)).toEqual(['default'])
    })

    it('US3/AS7: reads `work` from the lists, tolerating the UCB v3 AASX variants', () => {
      const repair = result.nodes[0].work as WorkDescriptionDef
      expect(repair.hierarchyScope).toBe('NTNU repair laboratory')
      expect(repair.workType).toBe('maintenance')
      expect(repair.parameters).toEqual([{ id: 'cureTemp', description: 'Cure temperature', value: '180', valueUnit: 'degC' }])
      expect(repair.personnel).toEqual([{
        id: 'personnel-1', classRef: 'urn:x:personnel-class:repair-technician', objectRef: undefined,
        description: 'Composite repair technician', use: 'execution', quantity: '1', quantityUnit: 'unit', properties: undefined,
      }])

      const tapes = result.nodes[1].work as WorkDescriptionDef
      expect(tapes.workType).toBe('production') // case-insensitive
      expect(tapes.equipment).toEqual([{
        id: 'equipment-1', classRef: 'urn:x:equipment-class:ud-tape-line', objectRef: 'urn:x:equipment:line-7',
        description: undefined, use: 'production', quantity: '1', quantityUnit: 'unit', properties: undefined,
      }])
      expect(tapes.materials).toEqual([{
        id: 'material-1', classRef: 'urn:x:material-class:carbon-fibre', objectRef: undefined, description: undefined,
        use: 'Consumed', quantity: '40', quantityUnit: 'kg', assemblyType: 'physical', assemblyRelationship: 'transient',
        properties: [
          { id: 'tow', description: undefined, value: '12K', valueUnit: undefined, quantity: undefined, quantityUnit: undefined },
          { id: 'sizing', description: undefined, value: 'epoxy-compatible', valueUnit: undefined, quantity: undefined, quantityUnit: undefined },
        ],
      }])
    })

    it('US3/AS8: uses the default machine name when the Environment has no shell', () => {
      const noShell = { ...clone(MWD_ONLY_ENVIRONMENT), assetAdministrationShells: [] }
      expect(importer.import(noShell).name).toBe('Imported Manufacturing Work Descriptions')
    })
  })

  describe('validation', () => {
    it('US3/AS9: accepts the Environment root, warns AAS_MWD_ONLY for shape (c), keeps the legacy codes', () => {
      expect(validateAas(mapper.machineToAas(MWD_MACHINE))).toMatchObject({ valid: true, errors: [] })
      const mwdOnly = validateAas(MWD_ONLY_ENVIRONMENT)
      expect(mwdOnly.valid).toBe(true)
      expect(mwdOnly.warnings.map((w) => w.code)).toContain('AAS_MWD_ONLY')
      expect(validateAas(LEGACY_ENVELOPE).valid).toBe(true)
      const legacyNoAsset = { ...clone(LEGACY_ENVELOPE), assetInformation: {} }
      expect(validateAas(legacyNoAsset).errors.map((e) => e.code)).toEqual(['AAS_MISSING_GLOBAL_ASSET_ID'])
      expect(validateAas({ foo: 1 }).errors.map((e) => e.code)).toEqual(['AAS_INVALID_ROOT'])
      expect(validateAas({ assetAdministrationShells: [], submodels: [] }).errors.map((e) => e.code)).toEqual(['AAS_NO_SUBMODELS'])
      const noWorkflow = { assetAdministrationShells: [], submodels: [{ modelType: 'Submodel', idShort: 'Nameplate', id: 'x' }] }
      expect(validateAas(noWorkflow).errors.map((e) => e.code)).toEqual(['AAS_MISSING_WORKFLOW_SUBMODEL'])
    })

    it('US3/AS10: rejects an MWD without the mandatory ID property with AAS_MWD_INVALID', () => {
      const doc: any = clone(mapper.machineToAas(MWD_MACHINE))
      const mwd = doc.submodels.find((sm: any) => sm.idShort === 'MWD_n_atl')
      mwd.submodelElements = mwd.submodelElements.filter((e: any) => e.idShort !== 'ID')
      const result = validateAas(doc)
      expect(result.valid).toBe(false)
      expect(result.errors).toEqual([expect.objectContaining({ code: 'AAS_MWD_INVALID', path: expect.stringMatching(/^submodels\[\d+\]/) })])
      expect(() => importer.import(doc)).toThrow(BadRequestException)
    })

    it('US3/AS11: imports AnnotatedRelationshipElement and legacy AnnotatedRelationship edges alike', () => {
      const doc: any = clone(mapper.machineToAas(MWD_MACHINE))
      const wf = doc.submodels.find((sm: any) => sm.idShort === 'WorkflowDefinition')
      for (const el of wf.submodelElements) if (el.modelType === 'AnnotatedRelationshipElement') el.modelType = 'AnnotatedRelationship'
      expect(importer.import(doc).edges.map((e: any) => e.id)).toEqual(['e-1', 'e-2', 'n-gw-n-ndi'])
    })
  })
})
