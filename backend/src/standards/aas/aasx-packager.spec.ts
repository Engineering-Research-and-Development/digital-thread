/**
 * AASX download of the AAS Environments. US5 = AASX / per-node downloads.
 */
import { NotFoundException } from '@nestjs/common'
import { AasController } from './aas.controller'
import { AasSubmodelsController } from './submodels.controller'
import { AasMapperService } from './aas-mapper.service'
import { AasImporterService } from './aas-importer.service'
import { AASX_CONTENT_TYPE, aasxFilename, packAasx, readAasx } from './aasx-packager'
import { MWD_MACHINE } from './aas-test.fixture'

/** Chainable Fastify reply stand-in (status/header/send), as used by sendAasx. */
function makeReply() {
  const reply: any = {
    headers: {} as Record<string, string>,
    body: undefined as Buffer | undefined,
    statusCode: 0,
    status(code: number) { this.statusCode = code; return this },
    header(k: string, v: string) { this.headers[k] = v; return this },
    send(b: Buffer) { this.body = b; return this },
  }
  return reply
}

describe('packAasx (US5 AASX download)', () => {
  const env = new AasMapperService().machineToAas(MWD_MACHINE)

  it('US5/AS1: writes the four OPC parts plus a JSON specification part that parses back to the Environment', () => {
    const { entries, parts, environment } = readAasx(packAasx(env))
    expect(entries.sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'aasx/_rels/aasx-origin.rels',
      'aasx/aasx-origin',
      'aasx/data.aas.json',
    ])
    expect(parts['[Content_Types].xml']).toContain('<Default Extension="json" ContentType="application/json" />')
    expect(parts['[Content_Types].xml']).toContain('<Override PartName="/aasx/aasx-origin" ContentType="text/plain" />')
    expect(parts['_rels/.rels']).toContain('Type="http://admin-shell.io/aasx/relationships/aasx-origin" Target="/aasx/aasx-origin"')
    expect(parts['aasx/_rels/aasx-origin.rels']).toContain('Type="http://admin-shell.io/aasx/relationships/aas-spec" Target="/aasx/data.aas.json"')
    expect(parts['aasx/aasx-origin']).toBe('Intentionally empty.')
    expect(environment).toEqual(JSON.parse(JSON.stringify(env)))
  })

  it('US5/AS2: derives a safe attachment filename from the idShort', () => {
    expect(aasxFilename('MWD Demo')).toBe('MWD_Demo.aasx')
    expect(aasxFilename('MWD_n_atl')).toBe('MWD_n_atl.aasx')
    expect(aasxFilename('1st')).toBe('aas_1st.aasx')
  })
})

describe('AasController per-node and AASX routes (US5)', () => {
  const machines: any = {
    findOne: jest.fn(async (id: string) => {
      if (id !== MWD_MACHINE.id) throw new NotFoundException(`StateMachine ${id} not found`)
      return MWD_MACHINE
    }),
  }
  const ctrl = new AasController(new AasMapperService(), new AasImporterService(), machines)

  it('US5/AS3: GET /aas/machines/:id/nodes/:nodeId/mwd returns the MWD of a task node and 404s otherwise', async () => {
    const env: any = await ctrl.getNodeMwd(MWD_MACHINE.id, 'n-atl')
    expect(Object.keys(env).sort()).toEqual(['conceptDescriptions', 'submodels'])
    expect(env.submodels[0].id).toBe('urn:digitalthread:sm:mwd:m-mwd-1:n-atl')
    await expect(ctrl.getNodeMwd(MWD_MACHINE.id, 'n-gw')).rejects.toThrow(NotFoundException) // gateway
    await expect(ctrl.getNodeMwd(MWD_MACHINE.id, 'n-trigger')).rejects.toThrow(NotFoundException) // trigger
    await expect(ctrl.getNodeMwd(MWD_MACHINE.id, 'missing')).rejects.toThrow(NotFoundException)
    await expect(ctrl.getNodeMwd('other', 'n-atl')).rejects.toThrow(NotFoundException)
  })

  it('US5/AS4: the AASX routes send the package with the AASX content type and an attachment filename', async () => {
    const full = makeReply()
    await ctrl.getMachineAasx(MWD_MACHINE.id, full)
    expect(full.statusCode).toBe(200)
    expect(full.headers['Content-Type']).toBe(AASX_CONTENT_TYPE)
    expect(full.headers['Content-Disposition']).toBe('attachment; filename="MWD_Demo.aasx"')
    expect(readAasx(full.body!).environment.assetAdministrationShells[0].id).toBe('urn:digitalthread:aas:machine:m-mwd-1')

    const node = makeReply()
    await ctrl.getNodeMwdAasx(MWD_MACHINE.id, 'n-ndi', node)
    expect(node.headers['Content-Disposition']).toBe('attachment; filename="MWD_n_ndi.aasx"')
    const unpacked = readAasx(node.body!).environment
    expect(unpacked.assetAdministrationShells).toBeUndefined()
    expect(unpacked.submodels.map((sm: any) => sm.idShort)).toEqual(['MWD_n_ndi'])

    await expect(ctrl.getNodeMwdAasx(MWD_MACHINE.id, 'n-gw', makeReply())).rejects.toThrow(NotFoundException)
  })
})

describe('AasSubmodelsController AASX routes (US5)', () => {
  const nodeEnv = { submodels: [{ id: 'urn:digitalthread:sm:mwd:iteration:it-1:n-1', idShort: 'MWD_n_1' }], conceptDescriptions: [] }
  const svc: any = {
    iterationShell: jest.fn(async (id: string) => (id === 'it-1'
      ? { assetAdministrationShells: [{ idShort: 'demo_0001' }], submodels: [], conceptDescriptions: [] }
      : null)),
    iterationNodeMwd: jest.fn(async () => nodeEnv),
  }
  const ctrl = new AasSubmodelsController(svc, {} as any)

  it('US5/AS5: GET /aas/iteration/:id/aasx names the file after the shell and 404s for an unknown iteration', async () => {
    const reply = makeReply()
    await ctrl.shellAasx('it-1', reply)
    expect(reply.headers['Content-Type']).toBe(AASX_CONTENT_TYPE)
    expect(reply.headers['Content-Disposition']).toBe('attachment; filename="demo_0001.aasx"')
    expect(readAasx(reply.body!).environment.assetAdministrationShells[0].idShort).toBe('demo_0001')
    await expect(ctrl.shellAasx('missing', makeReply())).rejects.toThrow(NotFoundException)
  })

  it('US5/AS6: GET /aas/iteration/:id/nodes/:nodeId/mwd/aasx names the file after the MWD', async () => {
    const reply = makeReply()
    await ctrl.nodeMwdAasx('it-1', 'n-1', reply)
    expect(svc.iterationNodeMwd).toHaveBeenCalledWith('it-1', 'n-1')
    expect(reply.headers['Content-Disposition']).toBe('attachment; filename="MWD_n_1.aasx"')
    expect(readAasx(reply.body!).environment).toEqual(nodeEnv)
  })
})
