import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, PanelRightOpen, PanelRightClose, Loader2, Wifi, WifiOff, Radio, FileSignature, Download, ChevronDown, GitBranch } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { canAuthorWorkflows } from '@/lib/roles'
import { IterationHeader } from '@/components/iteration/iteration-header'
import { IterationFieldIssues } from '@/components/iteration/iteration-field-issues'
import { IterationFlow } from '@/components/iteration/iteration-flow'
import { NodeDetailPanel } from '@/components/iteration/node-detail-panel'
import { IterationTimeline } from '@/components/iteration/iteration-timeline'
import { useIterationStore } from '@/stores/iteration-store'
import { useMachineStore } from '@/stores/machine-store'
import { useNodeExecution } from '@/hooks/use-node-execution'
import { useIterationSSE, type SSEStatus } from '@/hooks/use-iteration-sse'
import { NodeCategory, NodeStatus } from '@/types/enums'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/sonner'

export function IterationDetail() {
  const { iterationId } = useParams<{ iterationId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const {
    iterations,
    nodeStatuses,
    getUnlockedNodes,
    getNodeState,
    createIterationFromNode,
    setNodeStatus,
    loadIteration,
  } = useIterationStore()
  const { machines, init: initMachines } = useMachineStore()
  const { executeAutoNode, executeGateway } = useNodeExecution()
  const role = useAuthStore((s) => s.user?.role)

  // Subscribe to SSE for real-time updates
  const sse = useIterationSSE(iterationId)

  const highlightNodeId = searchParams.get('highlight')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(highlightNodeId)
  const [isExecuting, setIsExecuting] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(true)
  const [loadingIteration, setLoadingIteration] = useState(false)

  const iteration = iterationId ? iterations[iterationId] : undefined
  const headMachine = iteration ? machines[iteration.machineId] : undefined
  // Prefer the FROZEN snapshot from the iteration over the live state-machine
  // head. The head is only a fallback for ancient records missing a version
  // (cleared by `npm run migrate:versions`).
  const machine = useMemo(() => {
    if (!iteration) return undefined
    if (iteration.snapshotNodes && iteration.snapshotEdges) {
      return {
        ...(headMachine ?? { id: iteration.machineId, name: iteration.machineName, version: '' }),
        nodes: iteration.snapshotNodes,
        edges: iteration.snapshotEdges,
        // Frozen visual groups from the iteration's version.
        groups: iteration.snapshotGroups ?? headMachine?.groups ?? [],
      } as typeof headMachine
    }
    return headMachine
  }, [iteration, headMachine])
  const currentStatuses = iterationId ? nodeStatuses[iterationId] || {} : {}

  const selectedNode = machine?.nodes.find((n) => n.id === selectedNodeId) || null
  const selectedNodeState = selectedNodeId && iterationId ? getNodeState(iterationId, selectedNodeId) || null : null

  // Export the iteration as an AAS Instance shell (default) or as a
  // self-contained DTDL twin. AML is intentionally not offered for
  // iterations: CAEX is for engineering structure, not workflow runtime
  // state. The download is a single JSON blob, ready for hand-off across
  // partners.
  const exportIteration = useCallback(
    async (format: 'aas-shell' | 'dtdl-twin') => {
      if (!iteration) return
      try {
        let payload: unknown
        let suffix: string
        switch (format) {
          // AAS export is the COMPLETE Instance shell (all submodels inline) -
          // a single JSON file, no per-submodel choice.
          case 'aas-shell':       payload = await api.aasSubmodels.shell(iteration.id);       suffix = 'aas.shell.json'; break
          case 'dtdl-twin':       payload = await api.standards.exportDtdlIteration(iteration.id); suffix = 'dtdl.twin.json'; break
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${iteration.displayId || iteration.id}.${suffix}`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success(`Exported ${a.download}`)
      } catch (e: any) {
        toast.error(`Export failed: ${e?.message ?? 'unknown error'}`)
      }
    },
    [iteration],
  )

  // ALWAYS refetch on mount. Previously this used a cached-store guard which
  // left stale PENDING node states visible after the backend had
  // completed/failed the iteration via SSE while the user was elsewhere.
  // One round-trip per page entry is a small price for correctness.
  useEffect(() => {
    if (!iterationId) return

    const loadData = async () => {
      setLoadingIteration(true)
      try {
        await loadIteration(iterationId)
        if (Object.keys(machines).length === 0) {
          await initMachines()
        }
      } finally {
        setLoadingIteration(false)
      }
    }

    loadData()
  }, [iterationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-execute unlocked nodes
  const runUnlockedNodes = useCallback(async () => {
    if (!iterationId || !machine || isExecuting) return

    const unlocked = getUnlockedNodes(iterationId)
    if (unlocked.length === 0) return

    setIsExecuting(true)

    for (const nodeId of unlocked) {
      const node = machine.nodes.find((n) => n.id === nodeId)
      if (!node) continue

      const currentState = getNodeState(iterationId, nodeId)

      // MANUAL and TRIGGER nodes: promote IDLE → PENDING so user sees "Claim Action"
      if (node.type === NodeCategory.MANUAL || node.type === NodeCategory.TRIGGER) {
        if (!currentState || currentState.status === NodeStatus.IDLE) {
          setNodeStatus(iterationId, nodeId, NodeStatus.PENDING)
        }
        continue
      }

      if (node.type === NodeCategory.AUTOMATIC || node.type === NodeCategory.STORAGE) {
        // Only dispatch if node is PENDING (not already running/completed)
        if (!currentState || currentState.status === NodeStatus.IDLE || currentState.status === NodeStatus.PENDING) {
          await executeAutoNode(iterationId, nodeId, node.nodeTypeId ?? '', node.label ?? node.name ?? node.id, node.config ?? {}, node.responsiblePartner)
        }
      } else if (node.type === NodeCategory.GATEWAY) {
        if (!currentState || currentState.status === NodeStatus.IDLE || currentState.status === NodeStatus.PENDING) {
          await executeGateway(iterationId, nodeId, node.label ?? node.name ?? node.id)
        }
      }
    }

    setIsExecuting(false)
  }, [iterationId, machine, isExecuting, getUnlockedNodes, getNodeState, setNodeStatus, executeAutoNode, executeGateway])

  // Watch for status changes and run next batch
  useEffect(() => {
    if (!iterationId || !machine) return
    const timer = setTimeout(() => {
      runUnlockedNodes()
    }, 1000)
    return () => clearTimeout(timer)
  }, [currentStatuses, runUnlockedNodes, iterationId, machine])

  const handleRestartFromNode = useCallback(async (nodeId: string) => {
    if (!iterationId) return
    try {
      const newId = await createIterationFromNode(iterationId, nodeId)
      if (newId) {
        setSelectedNodeId(null)
        toast.success('Iteration restarted from selected node')
        navigate(`/iteration/${newId}`)
      }
    } catch (e: any) {
      toast.error(`Restart failed: ${e?.message ?? 'unknown error'}`)
    }
  }, [iterationId, createIterationFromNode, navigate])

  if (loadingIteration && !iteration) {
    return (
      <>
        <TopBar title="Iteration" subtitle="Loading..." />
        <div className="flex items-center justify-center h-[80vh] text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading iteration...</span>
        </div>
      </>
    )
  }

  if (!iteration) {
    return (
      <>
        <TopBar title="Iteration" subtitle="Not found" />
        <div className="flex items-center justify-center h-[80vh] text-muted-foreground">
          <p>Iteration not found. <Button variant="link" onClick={() => navigate('/')}>Go back</Button></p>
        </div>
      </>
    )
  }

  if (!machine) {
    return (
      <>
        <TopBar title={`Iteration ${iteration.displayId}`} subtitle="Loading machine..." />
        <div className="flex items-center justify-center h-[80vh] text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading workflow...</span>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar
        title={`Iteration ${iteration.displayId || iteration.id}`}
        subtitle={iteration.machineName}
        actions={
          <div className="flex items-center gap-2">
            <SSEStatusBadge status={sse.status} lastEventAt={sse.lastEventAt} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" title="Export this iteration in a standards-compliant format">
                  <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                  Export
                  <ChevronDown className="h-3 w-3 ml-1 opacity-70" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  AAS (IEC 63278) · Instance
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportIteration('aas-shell')}>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">Download AAS (JSON)</span>
                    <span className="text-[10px] text-muted-foreground">Complete Asset Instance shell - all submodels inline</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Alternate format
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => exportIteration('dtdl-twin')}>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">DTDL twin instance</span>
                    <span className="text-[10px] text-muted-foreground">Microsoft / Azure ADT · models + twins</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {canAuthorWorkflows(role) && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  title="Rebuild lineage - recompute lineage edges between files of this iteration"
                  aria-label="Rebuild lineage"
                  onClick={async () => {
                    try {
                      const res = await api.lineage.rebuildForIteration(iteration.id)
                      if (res.edgesCreated > 0) {
                        toast.success(`Lineage rebuilt: ${res.edgesCreated} new edge(s) across ${res.nodesWithEdges} node(s)`)
                      } else {
                        toast.success(`Lineage up to date (no new edges needed)`)
                      }
                    } catch (e: any) {
                      toast.error(`Rebuild failed: ${e?.message ?? 'unknown error'}`)
                    }
                  }}
                >
                  <GitBranch className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="sm" asChild title="Provenance">
                  <Link to={`/provenance/iteration/${iteration.id}`}>
                    <FileSignature className="h-4 w-4 mr-1" aria-hidden="true" />
                    Provenance
                  </Link>
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTimelineOpen(!timelineOpen)}
              title={timelineOpen ? 'Hide timeline' : 'Show timeline'}
              aria-label={timelineOpen ? 'Hide timeline' : 'Show timeline'}
              aria-pressed={timelineOpen}
            >
              {timelineOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Back
            </Button>
          </div>
        }
      />
      <IterationHeader iteration={iteration} />
      <IterationFieldIssues iterationId={iteration.id} />
      <div className="flex flex-1 min-h-0">
        {/* Flow area */}
        <div className="flex-1 min-h-0">
          <IterationFlow
            nodes={machine.nodes}
            edges={machine.edges}
            groups={machine.groups}
            nodeStatuses={currentStatuses}
            onNodeClick={(nodeId) => setSelectedNodeId(nodeId)}
            highlightNodeId={highlightNodeId}
          />
        </div>

        {/* Timeline sidebar */}
        {timelineOpen && (
          <div className="w-80 shrink-0">
            <IterationTimeline events={iteration.timeline || []} />
          </div>
        )}
      </div>
      <NodeDetailPanel
        open={selectedNodeId !== null}
        onClose={() => setSelectedNodeId(null)}
        node={selectedNode}
        nodeState={selectedNodeState}
        iterationId={iterationId!}
        onRestartFromNode={handleRestartFromNode}
      />
    </div>
  )
}

function SSEStatusBadge({ status, lastEventAt }: { status: SSEStatus; lastEventAt: number | null }) {
  const config: Record<SSEStatus, { icon: React.ReactNode; label: string; cls: string; detail: string }> = {
    connecting: {
      icon: <Wifi className="h-3 w-3 animate-pulse" aria-hidden="true" />,
      label: 'Connecting',
      cls: 'text-muted-foreground border-border bg-muted/30',
      detail: 'Establishing real-time connection',
    },
    live: {
      icon: <Radio className="h-3 w-3" aria-hidden="true" />,
      label: 'Live',
      cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      detail: lastEventAt ? `Last event ${formatRelative(lastEventAt)}` : 'Connected - waiting for events',
    },
    reconnecting: {
      icon: <Wifi className="h-3 w-3 animate-pulse" aria-hidden="true" />,
      label: 'Reconnecting',
      cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      detail: 'Connection interrupted - retrying...',
    },
    disconnected: {
      icon: <WifiOff className="h-3 w-3" aria-hidden="true" />,
      label: 'Offline',
      cls: 'text-red-400 border-red-500/30 bg-red-500/10',
      detail: 'Real-time updates unavailable - data may be stale',
    },
  }
  const entry = config[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold',
        entry.cls
      )}
      title={entry.detail}
      role="status"
      aria-live="polite"
    >
      {entry.icon}
      {entry.label}
    </span>
  )
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 5_000) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  return `${Math.round(diff / 3_600_000)}h ago`
}
