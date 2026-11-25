/**
 * Instance-level AAS export (GET /aas/iteration/:id/shell): Environment with
 * one IDTA 02100 MWD per TASK node of the iteration's FROZEN version.
 * US2 = Instance-level export.
 */
import { NotFoundException } from '@nestjs/common'
import { AasSubmodelsService } from './submodels.service'
import { findElement, propValue, refTarget } from './aas-core.util'
import { isMwdSubmodel } from './mwd-mapper'

const frozenNodes = [
  { id: 'n-start', kind: 'TRIGGER', name: 'Start', outputs: [] },
  { id: 'n-frozen', kind: 'TASK', name: 'Frozen job', responsiblePartnerIds: ['p-aim'], inputs: [], outputs: [] },
]
const headNodes = [
  { id: 'n-head', kind: 'TASK', name: 'Head job (edited after the iteration started)', inputs: [], outputs: [] },
]

function makeIteration(overrides: Record<string, any> = {}) {
  return {
    id: 'it-1',
    displayId: 'demo-0001',
    machineId: 'm-1',
    machineName: 'Demo',
    status: 'RUNNING',
    metadataJson: '{}',
    createdAt: new Date('2026-03-04T05:06:07.000Z'),
    completedAt: null,
    stateMachineVersionId: 'v-2',
    stateMachineVersion: { id: 'v-2', versionNumber: 2, versionLabel: '1.2.0', nodesJson: JSON.stringify(frozenNodes), edgesJson: '[]' },
    machine: { id: 'm-1', name: 'Demo', version: '1.3.0', nodesJson: JSON.stringify(headNodes), edgesJson: '[]' },
    nodeStates: [{ nodeId: 'n-frozen', status: 'RUNNING', claimedBy: 'operator@aim.example' }],
    product: null,
    ...overrides,
  }
}

function makeService(iteration: any) {
  const prisma: any = {
    iteration: { findUnique: jest.fn(async () => iteration) },
    fileRecord: { findMany: jest.fn(async () => []) },
    iterationManifest: { findMany: jest.fn(async () => []) },
    timelineEvent: { findMany: jest.fn(async () => []) },
  }
  return { svc: new AasSubmodelsService(prisma), prisma }
}

describe('AasSubmodelsService.iterationShell (US2 Instance-level export)', () => {
  it('US2/AS1: returns an Environment whose shell references every submodel, with the standard submodels kept', async () => {
    const { svc } = makeService(makeIteration())
    const env: any = await svc.iterationShell('it-1')
    expect(Object.keys(env).sort()).toEqual(['assetAdministrationShells', 'conceptDescriptions', 'submodels'])
    expect(env.submodelInline).toBeUndefined()
    const shell = env.assetAdministrationShells[0]
    expect(shell).toMatchObject({
      modelType: 'AssetAdministrationShell',
      id: 'urn:digitalthread:aas:iteration:it-1',
      assetInformation: { assetKind: 'Instance', globalAssetId: 'urn:digitalthread:asset:iteration:it-1' },
      derivedFrom: { type: 'ModelReference', keys: [{ type: 'AssetAdministrationShell', value: 'urn:digitalthread:aas:machine:m-1' }] },
    })
    expect(shell.submodels.map((r: any) => r.keys[0].value)).toEqual(env.submodels.map((sm: any) => sm.id))
    const idShorts = env.submodels.map((sm: any) => sm.idShort)
    for (const kept of ['TechnicalData', 'HandoverDocumentation', 'ProvenanceLog', 'WorkflowExecution']) expect(idShorts).toContain(kept)
    expect(idShorts).not.toContain('Nameplate') // no product attached
  })

  it('US2/AS2: builds the MWDs from the frozen StateMachineVersion, never from the machine head', async () => {
    const { svc } = makeService(makeIteration())
    const env: any = await svc.iterationShell('it-1')
    const mwds = env.submodels.filter(isMwdSubmodel)
    expect(mwds.map((sm: any) => sm.id)).toEqual(['urn:digitalthread:sm:mwd:iteration:it-1:n-frozen'])
    expect(mwds.some((sm: any) => propValue(sm, 'ID') === 'n-head')).toBe(false)
    const mwd = mwds[0]
    expect(propValue(mwd, 'DefinitionType')).toBe('instance')
    expect(propValue(mwd, 'Version')).toBe('1.2.0') // frozen version label, not the head's 1.3.0
    expect(findElement(mwd, 'PublishedDate')).toMatchObject({ valueType: 'xs:dateTime', value: '2026-03-04T05:06:07.000Z' })
    expect(propValue(mwd, 'HierarchyScope')).toBe('p-aim')
    expect(env.conceptDescriptions.some((cd: any) => cd.id === 'https://admin-shell.io/idta/ManufacturingWorkDescription/1/0')).toBe(true)
  })

  it('US2/AS3: falls back to the machine head only for legacy iterations without a frozen version', async () => {
    const { svc } = makeService(makeIteration({ stateMachineVersionId: null, stateMachineVersion: null }))
    const env: any = await svc.iterationShell('it-1')
    const mwds = env.submodels.filter(isMwdSubmodel)
    expect(mwds.map((sm: any) => propValue(sm, 'ID'))).toEqual(['n-head'])
    expect(propValue(mwds[0], 'Version')).toBe('1.3.0')
  })

  it('US2/AS4: never exports the claimant e-mail; a bare user id becomes a Person reference', async () => {
    const byEmail: any = await makeService(makeIteration()).svc.iterationShell('it-1')
    const mwdEmail = byEmail.submodels.filter(isMwdSubmodel)[0]
    const personnel = findElement(mwdEmail, 'PersonnelSpecifications').value
    expect(personnel).toHaveLength(1) // only the derived responsible partner
    expect(JSON.stringify(byEmail)).not.toContain('operator@aim.example') // nowhere in the Environment
    const execEmail = byEmail.submodels.find((sm: any) => sm.idShort === 'WorkflowExecution')
    expect(findElement(findElement(findElement(execEmail, 'NodeStates'), 'Node_n_frozen'), 'ClaimedBy')).toBeUndefined()

    const byId: any = await makeService(makeIteration({
      nodeStates: [{ nodeId: 'n-frozen', status: 'RUNNING', claimedBy: 'user-7f3a' }],
    })).svc.iterationShell('it-1')
    const mwdUser = byId.submodels.filter(isMwdSubmodel)[0]
    const items = findElement(mwdUser, 'PersonnelSpecifications').value
    expect(items).toHaveLength(2)
    expect(refTarget(items[0], 'PersonnelClass')).toBe('urn:digitalthread:partner:p-aim')
    expect(refTarget(items[1], 'Person')).toBe('urn:digitalthread:user:user-7f3a')
    expect(propValue(items[1], 'PersonnelUse')).toBe('claimant')
    const execId = byId.submodels.find((sm: any) => sm.idShort === 'WorkflowExecution')
    expect(propValue(findElement(findElement(execId, 'NodeStates'), 'Node_n_frozen'), 'ClaimedBy')).toBe('urn:digitalthread:user:user-7f3a')
  })

  it('US2/AS6: iterationNodeMwd returns only the MWD of that node (identical to the one in the shell) and 404s otherwise', async () => {
    const { svc } = makeService(makeIteration())
    const shell: any = await svc.iterationShell('it-1')
    const single: any = await svc.iterationNodeMwd('it-1', 'n-frozen')
    expect(Object.keys(single).sort()).toEqual(['conceptDescriptions', 'submodels'])
    expect(JSON.stringify(single.submodels[0])).toBe(JSON.stringify(shell.submodels.filter(isMwdSubmodel)[0]))
    await expect(svc.iterationNodeMwd('it-1', 'n-start')).rejects.toThrow(NotFoundException) // trigger
    await expect(svc.iterationNodeMwd('it-1', 'n-head')).rejects.toThrow(NotFoundException) // only on the head, not frozen
    await expect(makeService(null).svc.iterationNodeMwd('missing', 'n-frozen')).rejects.toThrow(NotFoundException)
  })

  it('US2/AS5: returns null for an unknown iteration', async () => {
    const { svc } = makeService(null)
    expect(await svc.iterationShell('missing')).toBeNull()
  })
})
