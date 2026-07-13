import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Play, Upload, FileText, Terminal, Hand, RotateCcw, User, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, FolderSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Classification, NodeCategory, NodeStatus } from '@/types/enums'
import type { FlowNodeDef, NodeRuntimeState } from '@/types/state-machine'
import { CATEGORY_COLORS, CATEGORY_LABELS, NODE_CATALOG_MAP } from '@/data/node-catalog'
import { getPartnerColor } from '@/lib/partner-utils'
import { useIterationStore } from '@/stores/iteration-store'
import { useMachineStore } from '@/stores/machine-store'
import { useAuthStore } from '@/stores/auth-store'
import { canActOnNode, canStartIteration, ROLE } from '@/lib/roles'
import { useNodeExecution } from '@/hooks/use-node-execution'
import { GuidedActions } from './guided-actions'
import { api } from '@/lib/api'
import { uploadNodeFile } from '@/lib/uploads'
import { FilePickerModal } from '@/components/uploads/file-picker-modal'
import { usePartnerStore } from '@/stores/partner-store'
import { normalizeFlowNode, nodeDisplayName, normalizeResponsiblePartnerIds } from '@/lib/normalize-node'
import { ClassificationInfoButton } from '@/components/governance/classification-info-button'
import { RequestAccessDialog } from '@/components/governance/request-access-dialog'
import { FileDownloadButton } from '@/components/governance/file-download-button'
import { useDownloadOrRequest } from '@/hooks/use-download-or-request'

interface NodeDetailPanelProps {
  open: boolean
  onClose: () => void
  node: FlowNodeDef | null
  nodeState: NodeRuntimeState | null
  iterationId: string
  onRestartFromNode?: (nodeId: string) => void
}

export function NodeDetailPanel({ open, onClose, node, nodeState, iterationId, onRestartFromNode }: NodeDetailPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Pending upload context - drives accept= filter and nodeOutputId on upload.
  // `kind: 'output'` completes the slot; `kind: 'input'` records the file as an
  // input contribution (legacy guided-action upload).
  const [pendingUpload, setPendingUpload] = useState<
    | { kind: 'output'; outputId: string; outputName: string; fileTypes: string[]; classification: Classification }
    | { kind: 'input'; inputId: string; inputName: string; fileTypes: string[]; classification: Classification }
    | null
  >(null)
  // "Select existing file" target output slot. When set, opens the
  // FilePickerModal filtered to the slot's accepted file types; the chosen
  // FileRecord is attached to this iteration's node output.
  const [pickerSlot, setPickerSlot] = useState<
    | { outputId: string; outputName: string; fileTypes: string[]; cardinality: 'ONE' | 'MANY' }
    | null
  >(null)
  // The classification level for each output is fixed by the state-machine
  // author at design time (`NodeOutputDef.defaultClassification`). The
  // partner sees the level read-only and cannot override it at upload.
  const { setNodeStatus, addTimelineEvent, addNodeLog, setInputFileStatus, recordNodeOutput, iterations, nodeStatuses } = useIterationStore()
  const { machines } = useMachineStore()
  const partners = usePartnerStore((s) => s.partners)
  const { executeAutoNode, executeGateway } = useNodeExecution()
  const authUser = useAuthStore((s) => s.user)
  // Gate node actions against ALL authorized partners of the node (not just
  // the legacy primary), so every responsible partner's operator can act.
  // SUPERADMIN acts on any node; OWNER/OPERATOR are scoped to their partner.
  const canAct = canActOnNode({
    role: authUser?.role,
    userPartnerName: authUser?.partner?.name ?? null,
    nodePartner: node?.responsiblePartner ?? null,
    nodePartnerNames: normalizeResponsiblePartnerIds(node).map((idOrName) => partners[idOrName]?.name ?? idOrName),
  })
  const canRunAuto = authUser?.role === ROLE.SUPERADMIN || authUser?.role === ROLE.OWNER
  const canRestart = canStartIteration(authUser?.role)

  // Predecessor outputs available for download.
  const [predOutputs, setPredOutputs] = useState<
    Awaited<ReturnType<typeof api.iterations.listPredecessorOutputs>> | null
  >(null)
  // FileRecord metadata for THIS node, grouped by output slot - lets us list
  // files with version / size / download link without re-fetching one by one.
  const [outputFilesBySlot, setOutputFilesBySlot] = useState<Record<string, Array<{
    id: string; filename: string; version: number; sizeBytes: number; contentHash: string | null; timestamp: string;
    classification: string
  }>>>({})

  // Normalised view of the node (canonical FlowNodeDef shape).
  const normalized = useMemo(() => (node ? normalizeFlowNode(node) : null), [node])

  // Governance - drives the per-file "Request access" flow when the partner
  // tries to download a file outside their scope (e.g. another partner's
  // outputs on a node not assigned to them).
  const dl = useDownloadOrRequest()

  // Governance grants - file ids the current user has an APPROVED, non-expired
  // access grant for. Lets an approved file render a real "Download" (not
  // "Request access") and download directly. Refreshed when a request is
  // submitted/decided (see `dl.state`).
  const [grantedFileIds, setGrantedFileIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    let active = true
    api.files
      .myAccessRequests()
      .then((rows) => {
        if (!active) return
        const now = Date.now()
        const granted = (rows ?? [])
          .filter((r) => r.status === 'APPROVED' && (!r.grantExpiresAt || new Date(r.grantExpiresAt).getTime() > now))
          .map((r) => r.fileId)
        setGrantedFileIds(new Set(granted))
      })
      .catch(() => {})
    return () => { active = false }
  }, [dl.state])

  useEffect(() => {
    if (!open || !node || !iterationId) return
    let cancelled = false
    api.iterations
      .listPredecessorOutputs(iterationId, node.id)
      .then((res) => { if (!cancelled) setPredOutputs(res) })
      .catch(() => { if (!cancelled) setPredOutputs(null) })
    return () => { cancelled = true }
  }, [open, node, iterationId, nodeState?.status])

  // Re-fetch this node's OWN output files when the panel opens, status flips, or
  // the outputs map updates (e.g. after a new upload / link-existing).
  //
  // Resolved from the node's `outputsJson` by id (api.iterations.listNodeOutputs)
  // - NOT api.files.list(iterationId, nodeId): a file attached from another
  // iteration ("link existing") keeps its origin iterationId, so the
  // iterationId-filtered list would silently drop it (and with it the
  // download / "Request access" action). The dedicated endpoint also surfaces
  // locked files for the request-access flow.
  useEffect(() => {
    if (!open || !node || !iterationId) return
    let cancelled = false
    api.iterations.listNodeOutputs(iterationId, node.id)
      .then((res) => {
        if (cancelled) return
        const grouped: Record<string, typeof outputFilesBySlot[string]> = {}
        for (const [slot, files] of Object.entries(res?.filesBySlot ?? {})) {
          grouped[slot] = (files ?? []).map((f) => ({
            id: f.id,
            filename: f.filename,
            version: f.version,
            sizeBytes: f.sizeBytes,
            contentHash: f.contentHash,
            timestamp: typeof f.timestamp === 'string' ? f.timestamp : new Date(f.timestamp).toISOString(),
            classification: typeof f.classification === 'string' ? f.classification : 'INTERNAL',
          }))
        }
        setOutputFilesBySlot(grouped)
      })
      .catch(() => { if (!cancelled) setOutputFilesBySlot({}) })
    return () => { cancelled = true }
  }, [open, node, iterationId, nodeState?.status, nodeState?.outputs])

  if (!node || !normalized) return null

  const status = nodeState?.status || NodeStatus.IDLE
  const catalog = NODE_CATALOG_MAP[node.nodeTypeId ?? '']
  const partnerColor = node.responsiblePartner ? (getPartnerColor(node.responsiblePartner)) : undefined
  const iteration = iterations[iterationId]
  const machine = iteration ? machines[iteration.machineId] : undefined
  const currentStatuses = nodeStatuses[iterationId] || {}
  const declaredOutputs = normalized.outputs ?? []

  // A node may have MULTIPLE responsible partners. Resolve each id from the
  // partner store to its display name (the legacy fallback may already be a
  // name, so keep it as-is when no id match is found), and fall back to the
  // single legacy `responsiblePartner` string when nothing else is available.
  const authorizedPartnerNames: string[] = (() => {
    const ids = normalizeResponsiblePartnerIds(node)
    const names = ids.map((idOrName) => partners[idOrName]?.name ?? idOrName)
    if (names.length > 0) return names
    return node.responsiblePartner ? [node.responsiblePartner] : []
  })()
  const authorizedPartnersLabel =
    authorizedPartnerNames.length > 0
      ? authorizedPartnerNames.join(', ')
      : (node.responsiblePartner ?? 'another partner')

  /** Shared access-decision context for every FileDownloadButton in this panel.
   * Single source of truth for the classification matrix + partner-scope
   * rules - see [lib/file-access.ts]. */
  const accessCtx = {
    role: authUser?.role,
    partnerName: authUser?.partner?.name ?? null,
    partnerId: authUser?.partnerId ?? authUser?.partner?.id ?? null,
    machineNodes: (machine?.nodes ?? []) as any,
  }
  // Legacy category fallback: nodes stored in the generic model may not carry
  // `type` (NodeCategory). Derive a visual category from `kind` so
  // CATEGORY_COLORS / CATEGORY_LABELS keep working.
  const legacyCategory: NodeCategory =
    node.type ??
    (normalized.kind === 'TRIGGER'
      ? NodeCategory.TRIGGER
      : normalized.kind === 'GATEWAY'
        ? NodeCategory.GATEWAY
        : NodeCategory.MANUAL)

  // Build predecessor outputs map for guided actions
  const predecessorOutputs: Record<string, string | undefined> = {}
  if (machine) {
    const incomingEdges = machine.edges.filter((e) => e.target === node.id)
    for (const edge of incomingEdges) {
      const predState = currentStatuses[edge.source]
      predecessorOutputs[edge.source] = predState?.outputFilePath
    }
  }

  // Opens the file picker for a specific node input; the upload itself runs in
  // handleFileSelected, which branches on pendingUpload.kind.
  const handleUploadInput = (inputId: string, inputLabel: string) => {
    const inputDef = (normalized.inputs ?? []).find((i) => i.id === inputId)
    setPendingUpload({
      kind: 'input',
      inputId,
      inputName: inputLabel,
      fileTypes: inputDef?.fileTypes ?? [],
      classification: Classification.INTERNAL,
    })
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  /** Opens the file picker for a specific declared output slot. */
  const handleUploadOutput = (outputId: string, outputName: string) => {
    const outputDef = declaredOutputs.find((o) => o.id === outputId)
    setPendingUpload({
      kind: 'output',
      outputId,
      outputName,
      fileTypes: outputDef?.fileTypes ?? [],
      classification: classificationFor(outputId),
    })
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  /** Resolve the read-only classification for a given output slot.
   * Authoritative source is the state-machine author's `defaultClassification`;
   * partners cannot override. The backend reconfirms this on saveUpload. */
  const classificationFor = (outputId: string): Classification => {
    const o = declaredOutputs.find((x) => x.id === outputId)
    return (o?.defaultClassification as Classification | undefined) ?? Classification.INTERNAL
  }

  /** Open the existing-file picker for a declared output slot. */
  const handlePickExisting = (outputId: string, outputName: string) => {
    const outputDef = declaredOutputs.find((o) => o.id === outputId)
    setPickerSlot({
      outputId,
      outputName,
      fileTypes: outputDef?.fileTypes ?? [],
      cardinality: outputDef?.cardinality === 'MANY' ? 'MANY' : 'ONE',
    })
  }

  /** Attach a previously-existing FileRecord to the active output slot, then
   * mirror the iteration store exactly as a fresh upload would. */
  const handleAttachExisting = async (file: { id: string; filename: string }) => {
    const slot = pickerSlot
    setPickerSlot(null)
    if (!slot) return
    const partner = node.responsiblePartner || 'Operator'
    const nodeLabel = nodeDisplayName(normalized)
    try {
      await api.iterations.attachExistingOutput(iterationId, node.id, slot.outputId, file.id)
      recordNodeOutput(iterationId, node.id, slot.outputId, file.id, slot.cardinality)
      setNodeStatus(iterationId, node.id, status)
      addNodeLog(iterationId, node.id, `Output "${slot.outputId}" linked to existing file: ${file.filename}`)
      addTimelineEvent(iterationId, {
        nodeId: node.id,
        nodeLabel,
        partner,
        action: 'Existing File Attached',
        detail: `Slot "${slot.outputId}" · ${file.filename}`,
      })
    } catch (e: any) {
      addNodeLog(iterationId, node.id, `Attach failed: ${e.message}`)
    }
  }

  const handleCompleteNode = async () => {
    const partner = node.responsiblePartner || 'Operator'
    try {
      await api.iterations.completeNode(iterationId, node.id)
      setNodeStatus(iterationId, node.id, NodeStatus.COMPLETED)
      addTimelineEvent(iterationId, {
        nodeId: node.id,
        nodeLabel: nodeDisplayName(normalized),
        partner,
        action: 'Node Completed',
        detail: `All required actions completed`,
      })
    } catch (e: any) {
      addNodeLog(iterationId, node.id, `Complete failed: ${e.message}`)
    }
  }

  const handleClaimAction = async () => {
    const partner = node.responsiblePartner || 'Operator'
    try {
      await api.iterations.claimNode(iterationId, node.id)
      setNodeStatus(iterationId, node.id, NodeStatus.RUNNING, { claimedBy: partner })
      addNodeLog(iterationId, node.id, `Action claimed by ${partner}`)
      addTimelineEvent(iterationId, {
        nodeId: node.id,
        nodeLabel: nodeDisplayName(normalized),
        partner,
        action: 'Action Claimed',
        detail: `${partner} claimed this action`,
      })
    } catch (e: any) {
      addNodeLog(iterationId, node.id, `Claim failed: ${e.message}`)
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const partner = node.responsiblePartner || 'Operator'
    const pending = pendingUpload
    setPendingUpload(null)

    addNodeLog(iterationId, node.id, `Uploading ${file.name}...`)

    try {
      const sizeKb = (file.size / 1024).toFixed(1)
      const nodeLabel = nodeDisplayName(normalized)

      if (pending?.kind === 'input') {
        // Input upload (manual provisioning of an upstream-expected file).
        // We attach it to the node's `default` output slot for traceability,
        // then immediately set the input pointer to the resulting FileRecord.
        // uploadNodeFile streams progress to the global upload-progress popover.
        const record = await uploadNodeFile(file, {
          iterationId,
          nodeId: node.id,
          nodeLabel,
          uploadType: 'MANUAL',
          classification: pending.classification,
        })
        await api.iterations.setInputFile(iterationId, node.id, pending.inputId, [record.id])
        setInputFileStatus(iterationId, node.id, pending.inputId, record.path)
        addNodeLog(iterationId, node.id, `Input "${pending.inputName}" uploaded: ${file.name} (${sizeKb} KB)`)
        addTimelineEvent(iterationId, {
          nodeId: node.id,
          nodeLabel,
          partner,
          action: 'Input Uploaded',
          detail: `"${pending.inputName}" - ${file.name} (${sizeKb} KB)`,
          filePath: record.path,
        })
      } else {
        // Output upload - fills the chosen declared slot (or `default` for
        // legacy nodes). Does NOT auto-complete: the partner clicks
        // "Complete & unlock next" explicitly so cardinality MANY uploads can
        // accumulate first.
        const outputId =
          pending?.kind === 'output'
            ? pending.outputId
            : (declaredOutputs[0]?.id ?? 'default')
        const outputDef = declaredOutputs.find((o) => o.id === outputId)
        const cardinality = (outputDef?.cardinality === 'MANY' ? 'MANY' : 'ONE') as 'ONE' | 'MANY'
        // uploadNodeFile streams progress to the global upload-progress popover.
        const record = await uploadNodeFile(file, {
          iterationId,
          nodeId: node.id,
          nodeOutputId: outputId,
          nodeLabel,
          uploadType: 'MANUAL',
          classification: pending?.kind === 'output' ? pending.classification : classificationFor(outputId),
        })
        // Update the per-output slot map locally so the card flips to
        // "filled" without waiting for an SSE refresh, and keep the legacy
        // outputFilePath in sync for older UI surfaces.
        recordNodeOutput(iterationId, node.id, outputId, record.id, cardinality)
        setNodeStatus(iterationId, node.id, status, { outputFilePath: record.path })
        addNodeLog(iterationId, node.id, `Output "${outputId}" uploaded: ${file.name} (${sizeKb} KB)`)
        addTimelineEvent(iterationId, {
          nodeId: node.id,
          nodeLabel,
          partner,
          action: 'Output Uploaded',
          detail: `Slot "${outputId}" · ${file.name} (${sizeKb} KB)`,
          filePath: record.path,
        })
      }
    } catch (e: any) {
      addNodeLog(iterationId, node.id, `Upload failed: ${e.message}`)
    }

    // Reset input so the same file can be re-uploaded if needed
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleManualUpload = () => {
    // Default to first declared output slot (or `default` if none).
    if (declaredOutputs.length === 0) {
      setPendingUpload({
        kind: 'output',
        outputId: 'default',
        outputName: 'Output',
        fileTypes: [],
        classification: Classification.INTERNAL,
      })
    } else if (declaredOutputs.length === 1) {
      const o = declaredOutputs[0]
      setPendingUpload({
        kind: 'output',
        outputId: o.id,
        outputName: o.name ?? o.label ?? o.id,
        fileTypes: o.fileTypes ?? [],
        classification: classificationFor(o.id),
      })
    }
    // Multi-output: the user picks via per-output buttons in the Outputs section
    // - we keep the legacy single button only as a shortcut for single-output nodes.
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  const fileInputAccept = pendingUpload?.fileTypes?.length ? pendingUpload.fileTypes.join(',') : undefined

  const handleRerun = async () => {
    if (legacyCategory === NodeCategory.GATEWAY) {
      await executeGateway(iterationId, node.id, nodeDisplayName(normalized), node.config ?? {})
    } else {
      try {
        await executeAutoNode(
          iterationId,
          node.id,
          node.nodeTypeId ?? '',
          nodeDisplayName(normalized),
          node.config ?? {},
          node.responsiblePartner,
        )
        addTimelineEvent(iterationId, {
          nodeId: node.id,
          nodeLabel: nodeDisplayName(normalized),
          partner: node.responsiblePartner || 'System',
          action: status === NodeStatus.ERROR ? 'Retry Triggered' : 'Auto Execution',
          detail: `API call: ${node.config?.apiEndpoint || 'internal service'}`,
        })
      } catch {
        // Error already logged inside executeAutoNode
      }
    }
  }

  const handleRestart = () => {
    if (onRestartFromNode) {
      onRestartFromNode(node.id)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[400px] overflow-y-auto">
        {/* Hidden file input for real file uploads - accept= reflects the
            currently pending output/input's declared file-type whitelist. */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={fileInputAccept}
          onChange={handleFileSelected}
        />
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="w-2 h-6 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[legacyCategory] }} />
            <SheetTitle className="text-sm">{nodeDisplayName(normalized)}</SheetTitle>
          </div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[legacyCategory]}</Badge>
            <Badge
              variant={
                status === NodeStatus.COMPLETED ? 'default' :
                status === NodeStatus.ERROR ? 'destructive' :
                status === NodeStatus.RUNNING ? 'secondary' :
                status === NodeStatus.PENDING ? 'secondary' : 'outline'
              }
              className={`text-[10px] ${status === NodeStatus.PENDING ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : ''}`}
            >
              {status === NodeStatus.PENDING ? 'YOUR TURN' : status}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-6" style={{ minHeight: 'calc(100vh - 200px)', paddingLeft: '10px', paddingRight: '10px' }}>
          {/* Partner section: a node may have MULTIPLE authorized partners;
              list them all (per-partner color pill) rather than just the
              legacy single responsiblePartner. */}
          {authorizedPartnerNames.length > 0 && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-md"
              style={{ backgroundColor: `${partnerColor}10`, borderLeft: `3px solid ${partnerColor}` }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <User className="h-3.5 w-3.5 shrink-0" style={{ color: partnerColor }} />
                {authorizedPartnerNames.map((name) => (
                  <span key={name} className="text-xs font-bold" style={{ color: getPartnerColor(name) }}>
                    {name}
                  </span>
                ))}
              </div>
              {nodeState?.claimedBy && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  Claimed by {nodeState.claimedBy}
                </span>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">{node.description}</p>

          {/* Expected output */}
          {catalog?.expectedOutput && (
            <div className="text-[10px] text-muted-foreground">
              Expected output: <span className="font-mono text-foreground/70">{catalog.expectedOutput}</span>
            </div>
          )}

          {/* Read-only banner for OPERATOR users on nodes that aren't theirs.
              Names every authorized partner, not just the first. */}
          {!canAct && status === NodeStatus.PENDING && (
            <div className="px-3 py-2 rounded-md bg-muted/50 border border-border text-[11px] text-muted-foreground">
              Read-only view. Node assigned to{' '}
              <span className="font-medium">{authorizedPartnersLabel}</span>.
            </div>
          )}

          {/* CLAIM ACTION - only for PENDING (yellow) nodes, gated by RBAC */}
          {status === NodeStatus.PENDING && canAct && (
            <Button
              size="sm"
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold"
              onClick={handleClaimAction}
            >
              <Hand className="h-3.5 w-3.5 mr-1.5" />
              Claim Action
            </Button>
          )}

          {/* Progress bar for running nodes */}
          {status === NodeStatus.RUNNING && nodeState?.progress !== undefined && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Processing...</span>
                <span>{nodeState.progress}%</span>
              </div>
              <Progress value={nodeState.progress} className="h-2" />
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs space-y-1">
            {nodeState?.startedAt && (
              <p className="text-muted-foreground">
                Started: {new Date(nodeState.startedAt).toLocaleString()}
              </p>
            )}
            {nodeState?.completedAt && (
              <p className="text-muted-foreground">
                Completed: {new Date(nodeState.completedAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Error message */}
          {nodeState?.errorMessage && (
            <div className="p-2 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {nodeState.errorMessage}
            </div>
          )}

          {/* ============ GUIDED ACTIONS (gated by RBAC) ============ */}
          {canAct && (status === NodeStatus.PENDING || status === NodeStatus.RUNNING) && (((normalized.inputs?.length ?? 0) + (normalized.outputs?.length ?? 0)) > 0) && (
            <>
              <Separator />
              <GuidedActions
                node={node}
                nodeState={nodeState}
                iterationId={iterationId}
                predecessorOutputs={predecessorOutputs}
                onUploadInput={handleUploadInput}
                onCompleteNode={handleCompleteNode}
              />
            </>
          )}

          {/* ============ PREDECESSOR DOWNLOADS ============ */}
          {predOutputs && predOutputs.inputs.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowDownToLine className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-semibold">Files from predecessors</span>
                  <ClassificationInfoButton ariaLabel="About classification levels" />
                </div>
                <div className="space-y-2">
                  {predOutputs.inputs.map((inp) => (
                    <div
                      key={inp.inputId}
                      className="rounded-md border border-border/50 bg-muted/15 p-2"
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[11px] font-semibold">
                          {inp.inputName}
                          {inp.required && (
                            <span className="ml-1 text-[9px] text-amber-400 font-semibold uppercase tracking-wide">
                              required
                            </span>
                          )}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground">
                          {inp.upstreamNodeName ?? inp.from.nodeId} · {inp.upstreamOutputName ?? inp.from.outputId}
                        </span>
                      </div>
                      {inp.files.length === 0 && !inp.legacyFilePath && (
                        <p className="text-[10px] italic text-muted-foreground">
                          Predecessor has not produced this file yet.
                        </p>
                      )}
                      {inp.legacyFilePath && inp.files.length === 0 && (
                        <p className="text-[10px] font-mono text-muted-foreground truncate" title={inp.legacyFilePath}>
                          {inp.legacyFilePath}
                        </p>
                      )}
                      {inp.files.length > 0 && (
                        <ul className="space-y-1">
                          {inp.files.map((f) => (
                            <li key={f.id} className="flex items-center justify-between text-[10px] gap-2">
                              <span className="font-mono truncate flex-1" title={f.filename}>{f.filename}</span>
                              <span className="text-muted-foreground tabular-nums">
                                v{f.version} · {(f.sizeBytes / 1024).toFixed(1)} KB
                              </span>
                              <FileDownloadButton
                                {...accessCtx}
                                fileId={f.id}
                                filename={f.filename}
                                version={f.version}
                                classification={(f as any).classification}
                                sourceNodeId={inp.from.nodeId}
                                outputId={inp.from.outputId}
                                granted={grantedFileIds.has(f.id)}
                                variant="blue"
                                onRequest={(fid, fname) => dl.openRequest(fid, fname)}
                                onProbe={(fid, fname) => dl.tryDownload(fid, fname)}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ============ OUTPUTS (per declared slot - always visible) ============ */}
          {(declaredOutputs.length >= 1 || Object.keys(outputFilesBySlot).length > 0) && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold">Outputs</span>
                  <ClassificationInfoButton ariaLabel="About classification levels" />
                  {declaredOutputs.length > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                      {declaredOutputs.filter((o) => (outputFilesBySlot[o.id]?.length ?? nodeState?.outputs?.[o.id]?.length ?? 0) > 0).length}
                      /{declaredOutputs.length} filled
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {/* Cards per declared output slot */}
                  {declaredOutputs.map((o) => {
                    const files = outputFilesBySlot[o.id] ?? []
                    const fileCount = files.length || (nodeState?.outputs?.[o.id]?.length ?? 0)
                    const filled = fileCount > 0
                    const canUpload = canAct && (status === NodeStatus.PENDING || status === NodeStatus.RUNNING)
                    const allowMore = !filled || o.cardinality === 'MANY'
                    const uploadDisabled = status === NodeStatus.PENDING && !nodeState?.claimedBy
                    return (
                      <div
                        key={o.id}
                        className={cn(
                          'rounded-md border p-2.5 transition-colors',
                          filled
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : o.required
                              ? 'bg-amber-500/5 border-amber-500/30'
                              : 'bg-muted/20 border-border/60',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded',
                              filled ? 'bg-emerald-500/20' : 'bg-blue-500/15',
                            )}
                          >
                            {filled ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                            ) : (
                              <Upload className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold truncate">
                                {o.name ?? o.label ?? o.id}
                              </span>
                              {o.required && (
                                <span className="text-[9px] uppercase tracking-wide font-semibold text-amber-400">
                                  required
                                </span>
                              )}
                              {o.cardinality === 'MANY' && (
                                <Badge variant="outline" className="text-[8px] h-3.5 px-1 leading-none">
                                  many
                                </Badge>
                              )}
                            </div>
                            {o.description && (
                              <p className="text-[10px] text-muted-foreground/80 mt-0.5 line-clamp-2">
                                {o.description}
                              </p>
                            )}
                            <div className="flex items-center gap-1 flex-wrap mt-1.5">
                              {(o.fileTypes ?? []).length === 0 ? (
                                <span className="text-[9px] text-muted-foreground/70 italic">
                                  any file type accepted
                                </span>
                              ) : (
                                (o.fileTypes ?? []).map((ext) => (
                                  <span
                                    key={ext}
                                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300"
                                  >
                                    {ext}
                                  </span>
                                ))
                              )}
                            </div>
                            {canUpload && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                                  Classification
                                </span>
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/30 border border-border/60"
                                  title="Set by the state-machine author - partners cannot override at upload time."
                                >
                                  {classificationFor(o.id)}
                                </span>
                                <ClassificationInfoButton ariaLabel="About classification levels" />
                              </div>
                            )}
                          </div>
                          {canUpload && (
                            <div className="flex shrink-0 flex-col gap-1">
                              <Button
                                size="sm"
                                className={cn(
                                  'h-7 px-2.5 text-[11px] font-semibold',
                                  filled
                                    ? 'bg-emerald-600/80 hover:bg-emerald-600 text-white'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white',
                                )}
                                onClick={() => handleUploadOutput(o.id, o.name ?? o.label ?? o.id)}
                                disabled={uploadDisabled || !allowMore}
                                title={
                                  !allowMore
                                    ? 'Single-file output already provided. Remove it first to re-upload.'
                                    : filled
                                      ? 'Add another file (cardinality MANY)'
                                      : 'Upload file'
                                }
                              >
                                <Upload className="h-3 w-3 mr-1" aria-hidden="true" />
                                {filled ? 'Add' : 'Upload'}
                              </Button>
                              {/* Attach a file already in the system instead
                                  of uploading a fresh one. */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-[11px] font-semibold"
                                onClick={() => handlePickExisting(o.id, o.name ?? o.label ?? o.id)}
                                disabled={uploadDisabled || !allowMore}
                                title={
                                  !allowMore
                                    ? 'Single-file output already provided. Remove it first to re-attach.'
                                    : 'Attach an existing file'
                                }
                              >
                                <FolderSearch className="h-3 w-3 mr-1" aria-hidden="true" />
                                Existing
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* File list with download - visible at every status.
                            Download is gated by the partner-scope rule
                            (canDownloadFile) so an operator viewing another
                            partner's node can see the files but only download
                            those declared as input on one of their own nodes. */}
                        {files.length > 0 && (
                          <ul className="mt-2 space-y-1 border-t border-emerald-500/20 pt-2">
                            {files.map((f) => (
                              <li key={f.id} className="flex items-center justify-between gap-2 text-[10px]">
                                <span className="font-mono truncate flex-1" title={f.filename}>{f.filename}</span>
                                <span className="text-muted-foreground tabular-nums shrink-0">
                                  v{f.version} · {(f.sizeBytes / 1024).toFixed(1)} KB
                                </span>
                                <FileDownloadButton
                                  {...accessCtx}
                                  fileId={f.id}
                                  filename={f.filename}
                                  version={f.version}
                                  classification={f.classification}
                                  sourceNodeId={node.id}
                                  outputId={o.id}
                                  granted={grantedFileIds.has(f.id)}
                                  variant="emerald"
                                  onRequest={(fid, fname) => dl.openRequest(fid, fname)}
                                  onProbe={(fid, fname) => dl.tryDownload(fid, fname)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}

                  {/* Files with no matching declared slot (legacy uploads or
                      orphan FileRecords). Surface them so the user can still
                      download them. */}
                  {(() => {
                    const declaredIds = new Set(declaredOutputs.map((o) => o.id))
                    const orphanSlots = Object.entries(outputFilesBySlot).filter(
                      ([slot]) => !declaredIds.has(slot),
                    )
                    if (orphanSlots.length === 0) return null
                    return orphanSlots.map(([slot, files]) => (
                      <div key={`orphan-${slot}`} className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold">
                            {slot === 'default' ? 'Output (legacy)' : `Output "${slot}"`}
                          </span>
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 leading-none">
                            not declared
                          </Badge>
                        </div>
                        <ul className="space-y-1">
                          {files.map((f) => (
                            <li key={f.id} className="flex items-center justify-between gap-2 text-[10px]">
                              <span className="font-mono truncate flex-1" title={f.filename}>{f.filename}</span>
                              <span className="text-muted-foreground tabular-nums shrink-0">
                                v{f.version} · {(f.sizeBytes / 1024).toFixed(1)} KB
                              </span>
                              <FileDownloadButton
                                {...accessCtx}
                                fileId={f.id}
                                filename={f.filename}
                                version={f.version}
                                classification={f.classification}
                                sourceNodeId={node.id}
                                outputId={slot}
                                granted={grantedFileIds.has(f.id)}
                                variant="blue"
                                onRequest={(fid, fname) => dl.openRequest(fid, fname)}
                                onProbe={(fid, fname) => dl.tryDownload(fid, fname)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  })()}
                </div>
                {canAct && status === NodeStatus.PENDING && !nodeState?.claimedBy && (
                  <p className="text-[10px] text-amber-500/90 mt-2">
                    Claim the node above before uploading.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Legacy "File Traceability" section removed - the input downloads
              are in "Files from predecessors" and the output downloads are in
              the "Outputs" section above. Both work at every node status. */}

          <Separator />

          {/* Logs */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Logs</span>
            </div>
            <ScrollArea className="h-40 rounded-md bg-muted/30 p-2">
              {nodeState?.logs && nodeState.logs.length > 0 ? (
                <div className="space-y-0.5">
                  {nodeState.logs.map((log, i) => (
                    <p key={i} className="text-[10px] font-mono text-muted-foreground">
                      {log}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground italic">No logs yet</p>
              )}
            </ScrollArea>
          </div>

          <Separator />

          {/* Actions - gated by RBAC */}
          <div className="space-y-2">
            {canRunAuto && (legacyCategory === NodeCategory.AUTOMATIC || legacyCategory === NodeCategory.STORAGE) && (
              <Button
                size="sm"
                className="w-full"
                onClick={handleRerun}
                disabled={status === NodeStatus.RUNNING}
              >
                <Play className="h-3 w-3 mr-1" />
                {status === NodeStatus.ERROR ? 'Retry' : 'Trigger Re-run'}
              </Button>
            )}

            {/* Legacy fallback - only when the node has zero declared outputs
                (data predating the declared-outputs model). New nodes go
                through the "Outputs to upload" section above which renders
                one card per declared output. */}
            {canAct &&
              (status === NodeStatus.RUNNING || status === NodeStatus.PENDING) &&
              declaredOutputs.length === 0 && (
                <Button
                  size="sm"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleManualUpload}
                  disabled={status === NodeStatus.PENDING && !nodeState?.claimedBy}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Upload File (default output)
                </Button>
              )}

            {canRunAuto && legacyCategory === NodeCategory.GATEWAY && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleRerun}
                disabled={status === NodeStatus.RUNNING}
              >
                <Play className="h-3 w-3 mr-1" />
                Evaluate Gate
              </Button>
            )}

            {/* Restart from this point - OWNER/SUPERADMIN only */}
            {canRestart && (status === NodeStatus.COMPLETED || status === NodeStatus.ERROR) && onRestartFromNode && (
              <>
                <Separator />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  onClick={handleRestart}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restart from this point
                </Button>
                <p className="text-[9px] text-muted-foreground text-center">
                  Creates a new iteration, inheriting upstream states and resetting downstream nodes.
                </p>
              </>
            )}
          </div>
        </div>
      </SheetContent>

      <RequestAccessDialog
        open={dl.state.kind === 'forbidden' || dl.state.kind === 'submitting' || dl.state.kind === 'submitted'}
        filename={dl.state.kind === 'forbidden' ? dl.state.filename : undefined}
        fileId={dl.state.kind === 'forbidden' || dl.state.kind === 'submitting' || dl.state.kind === 'submitted'
          ? (dl.state as { fileId: string }).fileId
          : undefined}
        submitting={dl.state.kind === 'submitting'}
        submitted={dl.state.kind === 'submitted' ? { status: dl.state.status } : null}
        errorMessage={dl.state.kind === 'error' ? dl.state.message : null}
        onSubmit={(reason) => {
          const fid = (dl.state as { fileId?: string }).fileId
          // Pass THIS iteration as the request context so governance links back
          // here (not the file's origin iteration, which differs for linked files).
          if (fid) dl.submitRequest(fid, reason, iterationId)
        }}
        onDownload={(fid) => { window.open(api.files.downloadUrl(fid), '_blank') }}
        onClose={dl.dismiss}
      />

      {/* Pick an existing RAW / iteration file for a declared output slot
          instead of uploading a fresh one. */}
      {pickerSlot && (
        <FilePickerModal
          open={!!pickerSlot}
          onOpenChange={(o) => { if (!o) setPickerSlot(null) }}
          fileTypes={pickerSlot.fileTypes}
          title={`Select an existing file for "${pickerSlot.outputName}"`}
          description="Pick a fresh (unattached) file or one produced by a previous iteration to attach to this output."
          onSelect={(file) => handleAttachExisting(file)}
        />
      )}
    </Sheet>
  )
}
