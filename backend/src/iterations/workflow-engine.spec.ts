import { WorkflowEngineService, NodeStatus } from './workflow-engine.service'

describe('WorkflowEngineService.evaluateGateway', () => {
  // evaluateGateway is a pure method — no dependencies are exercised.
  const engine = new WorkflowEngineService(
    null as any,
    null as any,
    null as any,
    null as any,
  )

  const statuses = (...s: NodeStatus[]): Record<string, NodeStatus> =>
    Object.fromEntries(s.map((v, i) => [`n${i}`, v]))

  it('AND passes only when every predecessor is COMPLETED', () => {
    expect(engine.evaluateGateway({ gateType: 'AND' }, statuses('COMPLETED', 'COMPLETED'))).toBe(true)
    expect(engine.evaluateGateway({ gateType: 'AND' }, statuses('COMPLETED', 'SKIPPED'))).toBe(false)
  })

  it('OR passes when at least one predecessor is COMPLETED', () => {
    expect(engine.evaluateGateway({ gateType: 'OR' }, statuses('SKIPPED', 'COMPLETED'))).toBe(true)
    expect(engine.evaluateGateway({ gateType: 'OR' }, statuses('SKIPPED', 'ERROR'))).toBe(false)
  })

  it('XOR passes only when exactly one predecessor is COMPLETED', () => {
    expect(engine.evaluateGateway({ gateType: 'XOR' }, statuses('COMPLETED', 'SKIPPED'))).toBe(true)
    expect(engine.evaluateGateway({ gateType: 'XOR' }, statuses('COMPLETED', 'COMPLETED'))).toBe(false)
  })

  it('defaults to AND semantics when no gate type is given', () => {
    expect(engine.evaluateGateway({}, statuses('COMPLETED', 'COMPLETED'))).toBe(true)
    expect(engine.evaluateGateway(undefined, statuses('COMPLETED', 'ERROR'))).toBe(false)
  })
})
