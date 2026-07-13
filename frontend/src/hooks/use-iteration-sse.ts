/**
 * Hook that subscribes to the backend SSE stream for a given iteration.
 * Updates the Zustand iteration store in real-time as events arrive.
 * Exposes a connection status so the UI can show a live/stale indicator.
 */
import { useEffect, useRef, useState } from 'react'
import { useIterationStore } from '@/stores/iteration-store'
import { NodeStatus, IterationStatus } from '@/types/enums'
import { api } from '@/lib/api'

export type SSEStatus = 'connecting' | 'live' | 'reconnecting' | 'disconnected'

export interface SSEState {
  status: SSEStatus
  lastEventAt: number | null
}

export function useIterationSSE(iterationId: string | undefined): SSEState {
  const {
    setNodeStatus,
    setNodeProgress,
    addNodeLog,
    addTimelineEvent,
    setIterationStatus,
  } = useIterationStore()

  const esRef = useRef<EventSource | null>(null)
  const [status, setStatus] = useState<SSEStatus>('connecting')
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)

  useEffect(() => {
    if (!iterationId) {
      setStatus('disconnected')
      return
    }

    esRef.current?.close()
    setStatus('connecting')

    const url = api.sseUrl(iterationId)
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setStatus('live')
    }

    es.onmessage = (ev) => {
      setLastEventAt(Date.now())
      setStatus('live')

      if (!ev.data || ev.data === ': ping') return

      let event: { type: string; iterationId: string; payload: any }
      try {
        event = JSON.parse(ev.data)
      } catch {
        return
      }

      if (event.iterationId !== iterationId) return

      const { type, payload } = event

      switch (type) {
        case 'node_status_changed': {
          const extra: any = {}
          if (payload.claimedBy) extra.claimedBy = payload.claimedBy
          if (payload.outputFilePath) extra.outputFilePath = payload.outputFilePath
          if (payload.errorMessage !== undefined) extra.errorMessage = payload.errorMessage
          if (payload.startedAt) extra.startedAt = payload.startedAt
          if (payload.completedAt) extra.completedAt = payload.completedAt
          setNodeStatus(iterationId, payload.nodeId as string, payload.status as NodeStatus, extra)
          break
        }
        case 'node_progress': {
          setNodeProgress(iterationId, payload.nodeId as string, payload.progress as number)
          break
        }
        case 'node_log': {
          addNodeLog(iterationId, payload.nodeId as string, payload.message as string)
          break
        }
        case 'timeline_event': {
          addTimelineEvent(iterationId, {
            nodeId: payload.nodeId ?? '',
            nodeLabel: payload.nodeLabel ?? '',
            partner: payload.partner ?? 'System',
            action: payload.action ?? '',
            detail: payload.detail ?? '',
            filePath: payload.filePath,
          })
          break
        }
        case 'iteration_status': {
          setIterationStatus(iterationId, payload.status as IterationStatus)
          break
        }
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects while readyState is CONNECTING/OPEN.
      // If it's CLOSED, the browser gave up.
      if (es.readyState === EventSource.CLOSED) {
        setStatus('disconnected')
      } else {
        setStatus('reconnecting')
      }
    }

    return () => {
      es.close()
      esRef.current = null
      setStatus('disconnected')
    }
  }, [iterationId, setNodeStatus, setNodeProgress, addNodeLog, addTimelineEvent, setIterationStatus])

  return { status, lastEventAt }
}
