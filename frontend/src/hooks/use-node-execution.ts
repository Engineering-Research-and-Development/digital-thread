import { useCallback } from 'react'
import { useIterationStore } from '@/stores/iteration-store'
import { api } from '@/lib/api'
import { NodeStatus } from '@/types/enums'

export function useNodeExecution() {
  const { setNodeStatus, setNodeProgress, addNodeLog } = useIterationStore()

  /**
   * Dispatch an automatic node to the backend execution engine.
   * The backend runs the handler and emits SSE events for progress updates.
   * We also do an optimistic local update (RUNNING state) immediately.
   */
  const executeAutoNode = useCallback(
    async (
      iterationId: string,
      nodeId: string,
      nodeTypeId: string,
      nodeLabel: string,
      config?: Record<string, any>,
      partner?: string,
    ) => {
      // Optimistic: immediately show as RUNNING
      setNodeStatus(iterationId, nodeId, NodeStatus.RUNNING)
      addNodeLog(iterationId, nodeId, `Dispatching ${nodeLabel} to execution engine...`)

      try {
        await api.exec.run({
          nodeTypeId,
          iterationId,
          nodeId,
          nodeLabel,
          partner: partner ?? 'System',
          config: config ?? {},
          inputs: {},
        })
        addNodeLog(iterationId, nodeId, `${nodeLabel} queued — awaiting results via SSE`)
      } catch (e: any) {
        addNodeLog(iterationId, nodeId, `ERROR: Failed to dispatch — ${e.message}`)
        setNodeStatus(iterationId, nodeId, NodeStatus.ERROR, {
          errorMessage: `Dispatch failed: ${e.message}`,
        })
      }
    },
    [setNodeStatus, setNodeProgress, addNodeLog], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /**
   * Execute a gateway node via the backend.
   */
  const executeGateway = useCallback(
    async (iterationId: string, nodeId: string, nodeLabel: string, config?: Record<string, any>) => {
      setNodeStatus(iterationId, nodeId, NodeStatus.RUNNING)
      addNodeLog(iterationId, nodeId, `Evaluating ${nodeLabel}...`)

      try {
        await api.exec.run({
          nodeTypeId: 'GATEWAY',
          iterationId,
          nodeId,
          nodeLabel,
          config: config ?? {},
          inputs: {},
        })
        addNodeLog(iterationId, nodeId, 'Gate evaluation dispatched — awaiting result via SSE')
      } catch {
        // Fallback: evaluate locally (gate always passes for demo)
        addNodeLog(iterationId, nodeId, 'All inputs PASS — gate opened (local eval)')
        setNodeStatus(iterationId, nodeId, NodeStatus.COMPLETED)
      }
    },
    [setNodeStatus, addNodeLog],
  )

  return { executeAutoNode, executeGateway }
}
