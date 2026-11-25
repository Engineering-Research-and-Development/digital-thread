/**
 * Standards round-trip test suite.
 *
 * Validates that DT → AAS / DTDL / AML → DT produces a structurally stable
 * result. Known-loss fields (custom `config`, `responsiblePartner` for
 * non-standard roles) are documented in comments and tolerated.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AasMapperService } from '../src/standards/aas/aas-mapper.service'
import { AasImporterService } from '../src/standards/aas/aas-importer.service'
import { DtdlExporterService } from '../src/standards/dtdl/dtdl-exporter.service'
import { DtdlImporterService } from '../src/standards/dtdl/dtdl-importer.service'
import { AmlExporterService } from '../src/standards/aml/aml-exporter.service'
import { AmlImporterService } from '../src/standards/aml/aml-importer.service'
import { AppModule } from '../src/app.module'

const sample = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Roundtrip Demo',
  version: '1.0.0',
  description: 'Structural round-trip test',
  dtmiBase: 'dtmi:digitalthread:workflow:roundtripdemo',
  nodesJson: JSON.stringify([
    { id: 'n1', nodeTypeId: 'CAD_UPLOAD', label: 'CAD Upload', type: 'TRIGGER', config: {} },
    { id: 'n2', nodeTypeId: 'SIM_CONSOLIDATION', label: 'Sim', type: 'AUTOMATIC', config: {}, responsiblePartner: 'ENS' },
    {
      id: 'n3', nodeTypeId: 'NDI_INSPECTION', label: 'NDI', type: 'MANUAL', config: {}, responsiblePartner: 'IMD',
      responsiblePartnerIds: ['p-imd'],
      // IDTA 02100 content: exported as a Manufacturing Work Description submodel.
      work: {
        workType: 'quality',
        parameters: [{ id: 'scanResolution', value: '0.1', valueUnit: 'mm' }],
        equipment: [{ id: 'eq-1', classRef: 'urn:compstlar:equipment-class:ultrasonic-scanner', use: 'inspection', quantity: '1', quantityUnit: 'unit' }],
      },
    },
  ]),
  edgesJson: JSON.stringify([{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }]),
}

describe('Standards round-trip', () => {
  let app: NestFastifyApplication
  let aasMap: AasMapperService, aasImp: AasImporterService
  let dtdlExp: DtdlExporterService, dtdlImp: DtdlImporterService
  let amlExp: AmlExporterService, amlImp: AmlImporterService

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
    // Same bootstrap as rbac.e2e-spec.ts: the platform is Fastify, not Express.
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    aasMap = app.get(AasMapperService)
    aasImp = app.get(AasImporterService)
    dtdlExp = app.get(DtdlExporterService)
    dtdlImp = app.get(DtdlImporterService)
    amlExp = app.get(AmlExporterService)
    amlImp = app.get(AmlImporterService)
  })
  afterAll(async () => { await app.close() })

  describe('AAS', () => {
    it('exports an Environment whose import yields the same nodes, edges and work description', () => {
      const aas = aasMap.machineToAas(sample)
      expect(Object.keys(aas).sort()).toEqual(['assetAdministrationShells', 'conceptDescriptions', 'submodels'])
      const imported = aasImp.import(aas)
      expect(imported.nodes.length).toBe(JSON.parse(sample.nodesJson).length)
      expect(imported.nodes.map((n: any) => n.id)).toEqual(['n1', 'n2', 'n3'])
      expect(imported.edges.map((e: any) => [e.source, e.target])).toEqual([['n1', 'n2'], ['n2', 'n3']])
      // legacy TRIGGER/AUTOMATIC/MANUAL categories normalise to kinds; only the two TASK nodes get an MWD
      expect(aas.submodels.filter((sm: any) => sm.idShort.startsWith('MWD_')).map((sm: any) => sm.idShort)).toEqual(['MWD_n2', 'MWD_n3'])
      const ndi = imported.nodes.find((n: any) => n.id === 'n3')
      expect(ndi.work).toMatchObject({
        workType: 'quality',
        parameters: [{ id: 'scanResolution', value: '0.1', valueUnit: 'mm' }],
        equipment: [expect.objectContaining({ classRef: 'urn:compstlar:equipment-class:ultrasonic-scanner', use: 'inspection', quantity: '1', quantityUnit: 'unit' })],
      })
      // A node exported without `work` imports back without `work` (export defaults are stripped symmetrically)
      const sim = imported.nodes.find((n: any) => n.id === 'n2')
      expect(sim.work).toBeUndefined()
    })
  })

  describe('DTDL', () => {
    it('export includes stable DTMI base', () => {
      const docs: any[] = dtdlExp.machineToDtdl(sample) as any[]
      const workflow = docs.find((d) => d['@id']?.includes('roundtripdemo'))
      expect(workflow).toBeTruthy()
      expect(workflow['@id']).toMatch(/^dtmi:digitalthread:workflow:roundtripdemo;\d+$/)
    })

    it('re-export is idempotent', () => {
      const first  = JSON.stringify(dtdlExp.machineToDtdl(sample))
      const second = JSON.stringify(dtdlExp.machineToDtdl(sample))
      expect(first).toBe(second)
    })
  })

  describe('AML', () => {
    it('exports XML that the importer consumes back into nodes/edges', () => {
      const xml = amlExp.machineToAml(sample)
      expect(typeof xml).toBe('string')
      expect(xml).toContain('CAEXFile')
      const imported = amlImp.importFromXml(xml)
      expect(imported.nodes.length).toBeGreaterThanOrEqual(2)
    })
  })
})
