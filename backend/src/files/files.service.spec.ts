import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { FilesService } from './files.service'
import { ROLE } from '@/auth/roles'

// Direct instantiation with hand-rolled mocks — storage and broker are unused
// by the partner-scope assertions under test.
function makeService(prisma: any) {
  // Default no-grant for the access-request lookup performed by hasActiveGrant.
  const merged = {
    fileAccessRequest: { findFirst: async () => null },
    ...prisma,
  }
  return new FilesService(merged, {} as any, {} as any)
}

const machineNodes = JSON.stringify([
  { id: 'n-cai', responsiblePartner: 'CAI' },
  { id: 'n-aim', responsiblePartner: 'AIMPLAS' },
])

describe('FilesService.findAll — node-scoped OPERATOR visibility', () => {
  function makeListService(items: any[], captureWhere: { where?: any }) {
    return makeService({
      fileRecord: {
        findMany: async ({ where }: any) => { captureWhere.where = where; return items },
        count: async () => items.length,
      },
      // collectFileReferences — no usages, returns empty refs.
      nodeRuntimeState: { findMany: async () => [] },
      iteration: { findMany: async () => [] },
    })
  }

  const lockedAndPartner = [
    { id: 'f-conf', classification: 'CONFIDENTIAL', path: '/bucket/secret.json', sourceInfo: 'User: operator@imd.eu', contentHash: 'deadbeef', filename: 'defect_map.json' },
    { id: 'f-part', classification: 'PARTNER', path: '/bucket/cad.step', sourceInfo: 'User: operator@cai.eu', contentHash: 'cafef00d', filename: 'cad.step' },
  ]

  it('lists CONFIDENTIAL/RESTRICTED files (no classification floor) so the operator can request access', async () => {
    const cap: { where?: any } = {}
    const svc = makeListService(lockedAndPartner, cap)
    const res = await svc.findAll({
      iterationId: 'V1', nodeId: 'lc-ai',
      requester: { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' },
    })
    // The previous PARTNER-only floor must NOT be applied for node-scoped calls.
    expect(cap.where?.classification).toBeUndefined()
    expect(res.items.map((f: any) => f.id).sort()).toEqual(['f-conf', 'f-part'])
  })

  it('redacts path / sourceInfo / contentHash of locked files but keeps the classification', async () => {
    const cap: { where?: any } = {}
    const svc = makeListService(lockedAndPartner, cap)
    const res = await svc.findAll({
      iterationId: 'V1', nodeId: 'lc-ai',
      requester: { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' },
    })
    const conf = res.items.find((f: any) => f.id === 'f-conf')!
    const part = res.items.find((f: any) => f.id === 'f-part')!
    // Locked file: sensitive metadata stripped, classification preserved for the
    // frontend's decideFileAccess → "Request access".
    expect(conf.path).toBe('')
    expect(conf.sourceInfo).toBe('')
    expect(conf.contentHash).toBeNull()
    expect(conf.classification).toBe('CONFIDENTIAL')
    // PARTNER-tier file: untouched.
    expect(part.path).toBe('/bucket/cad.step')
    expect(part.sourceInfo).toBe('User: operator@cai.eu')
    expect(part.contentHash).toBe('cafef00d')
  })
})

describe('FilesService.assertWritable', () => {
  it('throws NotFound when the iteration does not exist', async () => {
    const svc = makeService({ iteration: { findUnique: async () => null } })
    await expect(
      svc.assertWritable('it-x', 'n-cai', { role: ROLE.OWNER }),
    ).rejects.toThrow(NotFoundException)
  })

  it('throws NotFound when the node is not in the machine', async () => {
    const svc = makeService({
      iteration: { findUnique: async () => ({ machine: { nodesJson: machineNodes } }) },
    })
    await expect(
      svc.assertWritable('it-1', 'n-missing', { role: ROLE.OWNER }),
    ).rejects.toThrow(NotFoundException)
  })

  it('allows SUPERADMIN and OWNER on any node', async () => {
    const svc = makeService({
      iteration: { findUnique: async () => ({ machine: { nodesJson: machineNodes } }) },
    })
    await expect(
      svc.assertWritable('it-1', 'n-cai', { id: 'u-admin', role: ROLE.SUPERADMIN }),
    ).resolves.toBeUndefined()
    await expect(
      svc.assertWritable('it-1', 'n-aim', { role: ROLE.OWNER }),
    ).resolves.toBeUndefined()
  })

  it('allows an OPERATOR on its own node', async () => {
    const svc = makeService({
      iteration: { findUnique: async () => ({ machine: { nodesJson: machineNodes } }) },
      partner: { findUnique: async () => ({ id: 'p-cai', name: 'CAI' }) },
    })
    await expect(
      svc.assertWritable('it-1', 'n-cai', { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' }),
    ).resolves.toBeUndefined()
  })

  it('rejects an OPERATOR writing to another partner node', async () => {
    const svc = makeService({
      iteration: { findUnique: async () => ({ machine: { nodesJson: machineNodes } }) },
      partner: { findUnique: async () => ({ id: 'p-cai', name: 'CAI' }) },
    })
    await expect(
      svc.assertWritable('it-1', 'n-aim', { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' }),
    ).rejects.toThrow(ForbiddenException)
  })
})

describe('FilesService.assertReadable (partner-scope read)', () => {
  it('lets SUPERADMIN read any file', async () => {
    const svc = makeService({})
    await expect(
      svc.assertReadable({ classification: 'RESTRICTED' } as any, { id: 'u-admin', role: ROLE.SUPERADMIN }),
    ).resolves.toBeUndefined()
  })

  it('blocks an OPERATOR from a CONFIDENTIAL/RESTRICTED file', async () => {
    const svc = makeService({})
    await expect(
      svc.assertReadable(
        { classification: 'CONFIDENTIAL' } as any,
        { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' },
      ),
    ).rejects.toThrow(ForbiddenException)
  })

  it('lets any OPERATOR read an INTERNAL file (consortium-wide), regardless of producing partner', async () => {
    const svc = makeService({
      iteration: { findUnique: async () => ({ machine: { nodesJson: machineNodes } }) },
      partner: { findUnique: async () => ({ id: 'p-cai', name: 'CAI' }) },
    })
    await expect(
      svc.assertReadable(
        { id: 'f-1', classification: 'INTERNAL', iterationId: 'it-1', nodeSourceId: 'n-aim' } as any,
        { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' },
      ),
    ).resolves.toBeUndefined()
  })

  it('lets an OPERATOR read a PARTNER-classified file produced by its own node', async () => {
    const svc = makeService({
      iteration: { findUnique: async () => ({ machine: { nodesJson: machineNodes }, stateMachineVersion: null }) },
      partner: { findUnique: async () => ({ id: 'p-cai', name: 'CAI' }) },
    })
    await expect(
      svc.assertReadable(
        { id: 'f-1', classification: 'PARTNER', iterationId: 'it-1', nodeSourceId: 'n-cai' } as any,
        { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' },
      ),
    ).resolves.toBeUndefined()
  })

  it('blocks an OPERATOR from a PARTNER-classified file produced by another partner node (no input declaration)', async () => {
    const svc = makeService({
      iteration: { findUnique: async () => ({ machine: { nodesJson: machineNodes }, stateMachineVersion: null }) },
      partner: { findUnique: async () => ({ id: 'p-cai', name: 'CAI' }) },
    })
    await expect(
      svc.assertReadable(
        { id: 'f-2', classification: 'PARTNER', iterationId: 'it-1', nodeSourceId: 'n-aim' } as any,
        { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' },
      ),
    ).rejects.toThrow(ForbiddenException)
  })

  it('lets an OPERATOR read any classification when an active APPROVED grant exists', async () => {
    const svc = makeService({
      fileAccessRequest: {
        findFirst: async () => ({ id: 'gr-1', status: 'APPROVED', grantExpiresAt: null }),
      },
    })
    await expect(
      svc.assertReadable(
        { id: 'f-3', classification: 'CONFIDENTIAL', iterationId: 'it-1', nodeSourceId: 'n-x' } as any,
        { id: 'u-cai', role: ROLE.OPERATOR, partnerId: 'p-cai' },
      ),
    ).resolves.toBeUndefined()
  })
})
