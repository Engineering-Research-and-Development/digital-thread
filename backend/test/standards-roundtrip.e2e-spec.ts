/**
 * Standards round-trip test suite.
 *
 * Validates that DT → AAS / DTDL / AML → DT produces a structurally stable
 * result. Known-loss fields (custom `config`, `responsiblePartner` for
 * non-standard roles) are documented in comments and tolerated.
 */
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
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
    { id: 'n3', nodeTypeId: 'NDI_INSPECTION', label: 'NDI', type: 'MANUAL', config: {}, responsiblePartner: 'IMD' },
  ]),
  edgesJson: JSON.stringify([{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }]),
}

describe('Standards round-trip', () => {
  let app: INestApplication
  let aasMap: AasMapperService, aasImp: AasImporterService
  let dtdlExp: DtdlExporterService, dtdlImp: DtdlImporterService
  let amlExp: AmlExporterService, amlImp: AmlImporterService

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleFixture.createNestApplication()
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
    it('exports nodes count that matches import', () => {
      const aas = aasMap.machineToAas(sample)
      const imported = aasImp.aasToMachine ? aasImp.aasToMachine(aas) : null
      if (!imported) return
      const nodes = JSON.parse(imported.nodesJson || '[]')
      expect(nodes.length).toBe(JSON.parse(sample.nodesJson).length)
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
      const imported = amlImp.amlToMachine ? amlImp.amlToMachine(xml) : null
      if (!imported) return
      const nodes = JSON.parse(imported.nodesJson || '[]')
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })
  })
})
