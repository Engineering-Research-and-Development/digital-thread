import { BadRequestException } from '@nestjs/common'
import { IterationsService } from './iterations.service'

// Direct instantiation with hand-rolled mocks for Prisma and the engine.
function makeService(prisma: any, engine: any = {}) {
  return new IterationsService(prisma, engine)
}

describe('IterationsService.claimNode', () => {
  it('rejects claiming a node that is not PENDING', async () => {
    const prisma = {
      nodeRuntimeState: { findUnique: async () => ({ status: 'IDLE' }) },
    }
    await expect(
      makeService(prisma).claimNode('it-1', 'n-1', 'user@x'),
    ).rejects.toThrow(BadRequestException)
  })

  it('claims a PENDING node and promotes it to RUNNING', async () => {
    const prisma = {
      nodeRuntimeState: { findUnique: async () => ({ status: 'PENDING' }) },
    }
    const engine = { updateNodeStatus: jest.fn(async () => ({ status: 'RUNNING' })) }
    await makeService(prisma, engine).claimNode('it-1', 'n-1', 'user@x')
    expect(engine.updateNodeStatus).toHaveBeenCalledWith(
      'it-1',
      'n-1',
      'RUNNING',
      expect.any(Object),
    )
  })
})

describe('IterationsService.completeNode', () => {
  it('rejects completing a node that is not RUNNING', async () => {
    const prisma = {
      iteration: { findUnique: async () => ({ id: 'it-1', machineId: 'm-1' }) },
      stateMachine: { findUnique: async () => ({ id: 'm-1', nodesJson: '[]', edgesJson: '[]' }) },
      nodeRuntimeState: { findUnique: async () => ({ status: 'PENDING' }) },
    }
    await expect(
      makeService(prisma).completeNode('it-1', 'n-1'),
    ).rejects.toThrow(BadRequestException)
  })
})

describe('IterationsService.repair', () => {
  // Iteration mock now includes the joined `machine` (legacy path)
  // since `loadIterationFlow` consumes prisma's nested includes. The
  // `stateMachineVersion` field is left undefined to exercise the legacy
  // fallback used by pre-versioning data.
  const machine = {
    id: 'm-1',
    nodesJson: JSON.stringify([{ id: 'a' }, { id: 'b' }]),
    edgesJson: JSON.stringify([{ source: 'a', target: 'b' }]),
  }
  const baseIteration = {
    id: 'it-1',
    machineId: 'm-1',
    machine,
    stateMachineVersion: null,
  }

  // Iteration mock that supports both the legacy `findOne` shape and the
  // reconcile + loadIterationFlow shape (include of nested rels).
  const iterationFindUnique = async () => ({ ...baseIteration, status: 'RUNNING' })

  it('re-advances a COMPLETED node that still has an IDLE successor', async () => {
    const prisma = {
      iteration: {
        findUnique: iterationFindUnique,
        update: jest.fn(async () => baseIteration),
      },
      stateMachine: { findUnique: async () => machine },
      nodeRuntimeState: {
        findMany: async () => [
          { nodeId: 'a', status: 'COMPLETED' },
          { nodeId: 'b', status: 'IDLE' },
        ],
      },
    }
    const engine = { advanceWorkflow: jest.fn(async () => {}) }
    const result = await makeService(prisma, engine).repair('it-1')
    expect(engine.advanceWorkflow).toHaveBeenCalledTimes(1)
    expect(result.repaired).toBe(1)
  })

  it('does nothing when no COMPLETED node has an IDLE successor', async () => {
    const prisma = {
      iteration: {
        findUnique: iterationFindUnique,
        update: jest.fn(async () => baseIteration),
      },
      stateMachine: { findUnique: async () => machine },
      nodeRuntimeState: {
        findMany: async () => [
          { nodeId: 'a', status: 'COMPLETED' },
          { nodeId: 'b', status: 'COMPLETED' },
        ],
      },
    }
    const engine = { advanceWorkflow: jest.fn(async () => {}) }
    const result = await makeService(prisma, engine).repair('it-1')
    expect(engine.advanceWorkflow).not.toHaveBeenCalled()
    expect(result.repaired).toBe(0)
  })
})
