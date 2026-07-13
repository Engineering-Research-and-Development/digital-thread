import { useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEditorStore } from '@/stores/editor-store'
import { usePartnerStore } from '@/stores/partner-store'
import { useDataSourceStore } from '@/stores/datasource-store'
import { Cardinality, CLASSIFICATION_LIST, Classification, GatewayLogic, NodeKind } from '@/types/enums'
import type {
  FlowEdgeDef,
  FlowNodeDef,
  InputSource,
  NodeInputDef,
  NodeOutputDef,
} from '@/types/state-machine'
import { normalizeFlowNode, nodeDisplayName, normalizeResponsiblePartnerIds } from '@/lib/normalize-node'
import { Trash2, Plus, X, ArrowDownToLine, ArrowUpFromLine, User, Database, Check } from 'lucide-react'
import { ClassificationInfoButton } from '@/components/governance/classification-info-button'

interface NodePropertiesPanelProps {
  /** Live working graph from the canvas - includes nodes not yet saved. */
  nodes: FlowNodeDef[]
  edges: FlowEdgeDef[]
  onDeleteNode: (nodeId: string) => void
  onUpdateNode: (nodeId: string, updates: Partial<FlowNodeDef>) => void
}

const KIND_LABELS: Record<NodeKind, string> = {
  TRIGGER: 'Trigger',
  TASK: 'Task',
  GATEWAY: 'Gateway',
}

const KIND_COLORS: Record<NodeKind, string> = {
  TRIGGER: '#10B981',
  TASK: '#3B82F6',
  GATEWAY: '#F59E0B',
}

/**
 * A GATEWAY forwards every input it receives to its successors, so its
 * outputs mirror its inputs 1:1 (same id/name/fileTypes). Kept in sync in the
 * editor; the normalizers re-derive it server-side too.
 */
function mirrorGatewayOutputs(inputs: NodeInputDef[]): NodeOutputDef[] {
  return (inputs ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    cardinality: i.cardinality,
    required: i.required,
    fileTypes: i.fileTypes ?? [],
  }))
}

function normalizeExtension(raw: string): string | null {
  const t = raw.trim().toLowerCase()
  if (!t) return null
  return t.startsWith('.') ? t : `.${t}`
}

function uniqExtensions(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map(normalizeExtension)
        .filter((e): e is string => Boolean(e)),
    ),
  )
}

export function NodePropertiesPanel({ nodes, edges, onDeleteNode, onUpdateNode }: NodePropertiesPanelProps) {
  const { selectedNodeId, isPanelOpen, closePanel } = useEditorStore()
  const partners = usePartnerStore((s) => s.partners)
  const sources = useDataSourceStore((s) => s.sources)

  // All hooks must run on every render (Rules of Hooks). We compute `node` and
  // `predecessorNodes` unconditionally; the early-return for "no node selected"
  // happens *after* every hook has been called.
  const rawNode = nodes.find((n) => n.id === selectedNodeId)
  const node = useMemo(() => (rawNode ? normalizeFlowNode(rawNode) : undefined), [rawNode])

  const predecessorNodes = useMemo(() => {
    if (!node) return []
    const incomingSourceIds = new Set(
      edges.filter((e) => e.target === node.id).map((e) => e.source),
    )
    return nodes
      .map((n) => normalizeFlowNode(n))
      .filter((n) => incomingSourceIds.has(n.id))
  }, [nodes, edges, node])

  if (!rawNode || !node) {
    return (
      <Sheet open={isPanelOpen} onOpenChange={(open) => !open && closePanel()}>
        <SheetContent className="w-[380px] pl-8 pr-6">
          <SheetHeader>
            <SheetTitle>No node selected</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }

  const partnerList = Object.values(partners)
  const sourceList = Object.values(sources)
  const kind: NodeKind = node.kind ?? NodeKind.TASK
  const inputs = node.inputs ?? []
  const outputs = node.outputs ?? []
  const tags = node.tags ?? []

  // Multi-partner responsible-partner selection. Canonical selection is the
  // array; we keep the legacy single fields (`responsiblePartnerId` /
  // `responsiblePartner`) mirroring the primary (first) selection for round-trip.
  const responsibleIds = normalizeResponsiblePartnerIds(node)
  const selectedPartners = responsibleIds
    .map((id) => partnerList.find((p) => p.id === id))
    .filter((p): p is (typeof partnerList)[number] => Boolean(p))

  const writeResponsiblePartners = (ids: string[]) => {
    const primary = partnerList.find((p) => p.id === ids[0])
    onUpdateNode(node.id, {
      responsiblePartnerIds: ids,
      // Legacy mirrors: primary partner only.
      responsiblePartnerId: ids[0] ?? undefined,
      responsiblePartner: primary?.name ?? undefined,
    })
  }

  const togglePartner = (id: string) => {
    writeResponsiblePartners(
      responsibleIds.includes(id)
        ? responsibleIds.filter((x) => x !== id)
        : [...responsibleIds, id],
    )
  }

  // --- Top-level field updates (keep legacy fields in sync for round-trip) ---
  const updateName = (name: string) => {
    onUpdateNode(node.id, { name, label: name })
  }

  const updateKind = (newKind: NodeKind) => {
    const patch: Partial<FlowNodeDef> = { kind: newKind }
    // keep `type` legacy in sync - collapse TASK → MANUAL visual by default
    if (newKind === NodeKind.TRIGGER) {
      // A TRIGGER is a Task WITHOUT inputs.
      patch.type = 'TRIGGER'
      patch.inputs = []
    } else if (newKind === NodeKind.GATEWAY) {
      // A GATEWAY evaluates AND/OR over its inputs and FORWARDS all of them
      // as outputs (outputs mirror inputs 1:1).
      patch.type = 'GATEWAY'
      patch.gateway = node.gateway ?? { logic: GatewayLogic.AND }
      patch.outputs = mirrorGatewayOutputs(node.inputs ?? [])
    } else {
      patch.type = 'MANUAL'
    }
    onUpdateNode(node.id, patch)
  }

  const updateDescription = (description: string) => {
    onUpdateNode(node.id, { description })
  }

  const updateTags = (raw: string) => {
    const next = Array.from(new Set(raw.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean)))
    onUpdateNode(node.id, { tags: next })
  }

  const updateGatewayLogic = (logic: GatewayLogic) => {
    onUpdateNode(node.id, { gateway: { logic } })
  }

  // --- I/O management ---
  // A GATEWAY forwards all its inputs → keep its outputs mirrored from inputs.
  const writeInputs = (next: NodeInputDef[]) =>
    node.kind === NodeKind.GATEWAY
      ? onUpdateNode(node.id, { inputs: next, outputs: mirrorGatewayOutputs(next) })
      : onUpdateNode(node.id, { inputs: next })
  const writeOutputs = (next: NodeOutputDef[]) => onUpdateNode(node.id, { outputs: next })

  const addInput = () => {
    const newInput: NodeInputDef = {
      id: `in-${Date.now()}`,
      name: 'New input',
      cardinality: Cardinality.ONE,
      required: true,
      fileTypes: [],
      source: { kind: 'MANUAL' },
    }
    writeInputs([...inputs, newInput])
  }

  const updateInput = (index: number, updates: Partial<NodeInputDef>) => {
    writeInputs(inputs.map((inp, i) => (i === index ? { ...inp, ...updates } : inp)))
  }

  const removeInput = (index: number) => {
    writeInputs(inputs.filter((_, i) => i !== index))
  }

  const setInputSource = (index: number, source: InputSource) => updateInput(index, { source })

  const addOutput = () => {
    const newOutput: NodeOutputDef = {
      id: `out-${Date.now()}`,
      name: 'New output',
      cardinality: Cardinality.ONE,
      required: false,
      fileTypes: [],
    }
    writeOutputs([...outputs, newOutput])
  }

  const updateOutput = (index: number, updates: Partial<NodeOutputDef>) => {
    writeOutputs(outputs.map((out, i) => (i === index ? { ...out, ...updates } : out)))
  }

  const removeOutput = (index: number) => {
    writeOutputs(outputs.filter((_, i) => i !== index))
  }

  return (
    <Sheet open={isPanelOpen} onOpenChange={(open) => !open && closePanel()}>
      <SheetContent className="w-[400px] pl-8 pr-6 overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="w-2 h-6 rounded-full" style={{ backgroundColor: KIND_COLORS[kind] }} />
            <SheetTitle className="text-sm">{nodeDisplayName(node)}</SheetTitle>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge variant="outline" className="text-[10px]">{KIND_LABELS[kind]}</Badge>
            {selectedPartners.length > 0
              ? selectedPartners.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="text-[10px] gap-1"
                    style={{ backgroundColor: `${p.color}22`, color: p.color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </Badge>
                ))
              : node.responsiblePartner && (
                  <Badge variant="secondary" className="text-[10px]">{node.responsiblePartner}</Badge>
                )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="general" className="text-[10px]">General</TabsTrigger>
            <TabsTrigger value="io" className="text-[10px]">I/O</TabsTrigger>
            <TabsTrigger value="partner" className="text-[10px]">Partner</TabsTrigger>
          </TabsList>

          {/* ===== GENERAL TAB ===== */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">Name</Label>
              <Input
                value={nodeDisplayName(node)}
                onChange={(e) => updateName(e.target.value)}
                className="h-8 text-xs"
                placeholder="Visible on the canvas"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={node.description ?? ''}
                onChange={(e) => updateDescription(e.target.value)}
                className="text-xs min-h-[60px]"
                placeholder="Why does this node exist? What does the partner do here?"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={(v) => updateKind(v as NodeKind)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NodeKind.TRIGGER}>Trigger - pipeline entry (no inputs)</SelectItem>
                  <SelectItem value={NodeKind.TASK}>Task - work performed by a partner</SelectItem>
                  <SelectItem value={NodeKind.GATEWAY}>Gateway - conditional + forwards inputs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Tags</Label>
              <Input
                value={tags.join(', ')}
                onChange={(e) => updateTags(e.target.value)}
                className="h-8 text-[11px] font-mono"
                placeholder="design, UC1, cad"
              />
              <p className="text-[9px] text-muted-foreground">Comma-separated. Useful for filtering and grouping.</p>
            </div>

            {kind === NodeKind.GATEWAY && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Gate Logic</Label>
                  <Select
                    value={node.gateway?.logic === GatewayLogic.OR ? GatewayLogic.OR : GatewayLogic.AND}
                    onValueChange={(v) => updateGatewayLogic(v as GatewayLogic)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={GatewayLogic.AND}>AND - passes when ALL inputs are received</SelectItem>
                      <SelectItem value={GatewayLogic.OR}>OR - passes when ANY input is received</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[9px] text-muted-foreground">
                    Bind this gate's inputs to predecessor outputs (I/O tab). When it passes, it
                    forwards every received input to its successors automatically.
                  </p>
                </div>
              </>
            )}

            {/* Semantic round-trip (read-only badges) */}
            {(node.semantic?.aas?.semanticId || node.semantic?.dtdl?.interfaceId || node.semantic?.aml?.systemUnitClassPath) && (
              <>
                <Separator />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Standards mapping</Label>
                  <div className="flex flex-wrap gap-1">
                    {node.semantic?.aas?.semanticId && (
                      <Badge variant="outline" className="text-[9px] font-mono" title={node.semantic.aas.semanticId}>
                        AAS · {node.semantic.aas.semanticId.slice(0, 24)}…
                      </Badge>
                    )}
                    {node.semantic?.dtdl?.interfaceId && (
                      <Badge variant="outline" className="text-[9px] font-mono" title={node.semantic.dtdl.interfaceId}>
                        DTDL · {node.semantic.dtdl.interfaceId.slice(0, 24)}…
                      </Badge>
                    )}
                    {node.semantic?.aml?.systemUnitClassPath && (
                      <Badge variant="outline" className="text-[9px] font-mono" title={node.semantic.aml.systemUnitClassPath}>
                        AML · {node.semantic.aml.systemUnitClassPath.slice(0, 24)}…
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* ===== I/O TAB ===== */}
          <TabsContent value="io" className="space-y-4 mt-4">
            {/* Inputs - a TRIGGER has no inputs (it's the pipeline entry point). */}
            {kind === NodeKind.TRIGGER ? (
              <p className="text-[10px] text-muted-foreground italic">
                A Trigger is the pipeline entry point and has no inputs. Define its outputs below.
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownToLine className="h-3 w-3 text-blue-400" />
                    <span className="text-xs font-semibold text-blue-400">Inputs</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={addInput}>
                    <Plus className="h-3 w-3 mr-0.5" />
                    Add
                  </Button>
                </div>

                {inputs.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">No inputs defined</p>
                ) : (
                  <div className="space-y-2">
                    {inputs.map((inp, i) => (
                      <InputEditor
                        key={inp.id}
                        input={inp}
                        index={i}
                        predecessorNodes={predecessorNodes}
                        dataSources={sourceList}
                        onChange={(updates) => updateInput(i, updates)}
                        onSetSource={(src) => setInputSource(i, src)}
                        onRemove={() => removeInput(i)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Outputs - a GATEWAY's outputs are auto-forwarded from its inputs (read-only). */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <ArrowUpFromLine className="h-3 w-3 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">Outputs</span>
                </div>
                {kind === NodeKind.GATEWAY ? (
                  <span className="text-[9px] text-muted-foreground">forwarded from inputs</span>
                ) : (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={addOutput}>
                    <Plus className="h-3 w-3 mr-0.5" />
                    Add
                  </Button>
                )}
              </div>

              {kind === NodeKind.GATEWAY ? (
                outputs.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic">Add inputs above - the gate forwards each one to its successors.</p>
                ) : (
                  <div className="space-y-1">
                    {outputs.map((out) => (
                      <div key={out.id} className="flex items-center gap-1.5 text-[11px] rounded border border-border px-2 py-1">
                        <ArrowUpFromLine className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span className="font-medium truncate">{out.name}</span>
                        {(out.fileTypes ?? []).length > 0 && (
                          <span className="text-[9px] text-muted-foreground font-mono truncate">{(out.fileTypes ?? []).join(' ')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : outputs.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">No outputs defined</p>
              ) : (
                <div className="space-y-2">
                  {outputs.map((out, i) => (
                    <OutputEditor
                      key={out.id}
                      output={out}
                      index={i}
                      onChange={(updates) => updateOutput(i, updates)}
                      onRemove={() => removeOutput(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== PARTNER TAB ===== */}
          <TabsContent value="partner" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-muted-foreground" />
                <Label className="text-xs">Responsible Partners</Label>
              </div>
              <p className="text-[9px] text-muted-foreground">
                Declares WHO MAY upload here - any of the selected partners. The first
                pick is the primary (kept for legacy round-trip). Toggle to (de)select.
              </p>

              {/* Multi-select via toggle-badges over the partner list. */}
              <div className="flex flex-wrap gap-1.5">
                {partnerList.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic">No partners available</p>
                )}
                {partnerList.map((p) => {
                  const active = responsibleIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePartner(p.id)}
                      aria-pressed={active}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] transition-colors"
                      style={
                        active
                          ? { backgroundColor: `${p.color}22`, borderColor: p.color, color: p.color }
                          : { borderColor: 'var(--border)' }
                      }
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                      {active && <Check className="h-3 w-3" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>

              {/* Per-partner detail cards for the current selection, primary first. */}
              {selectedPartners.length > 0 && (
                <div className="space-y-2 mt-2">
                  {selectedPartners.map((p, i) => (
                    <div
                      key={p.id}
                      className="rounded-md px-3 py-2"
                      style={{ backgroundColor: `${p.color}10`, borderLeft: `3px solid ${p.color}` }}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold" style={{ color: p.color }}>{p.name}</p>
                        {i === 0 && (
                          <Badge variant="outline" className="text-[8px] uppercase tracking-wider">Primary</Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{p.fullName}</p>
                      {p.role && (
                        <Badge variant="outline" className="text-[9px] mt-1">{p.role}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Fallback when only the legacy name is present (no matching partner row). */}
              {selectedPartners.length === 0 && node.responsiblePartner && (
                <p className="text-[10px] text-muted-foreground italic mt-2">
                  Legacy assignment: {node.responsiblePartner}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />

        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => {
            onDeleteNode(node.id)
            closePanel()
          }}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Delete Node
        </Button>
      </SheetContent>
    </Sheet>
  )
}

// ─── InputEditor ────────────────────────────────────────────────────────────

interface InputEditorProps {
  input: NodeInputDef
  index: number
  predecessorNodes: FlowNodeDef[]
  dataSources: Array<{ id: string; name: string }>
  onChange: (updates: Partial<NodeInputDef>) => void
  onSetSource: (source: InputSource) => void
  onRemove: () => void
}

function InputEditor({ input, index, predecessorNodes, dataSources, onChange, onSetSource, onRemove }: InputEditorProps) {
  // Normalise the legacy bare-string `source` ('MANUAL' | 'PREDECESSOR' | 'DATASOURCE')
  // into the canonical discriminated union for narrowing.
  const source: InputSource =
    typeof input.source === 'string'
      ? input.source === 'DATASOURCE' && input.dataSourceId
        ? { kind: 'DATASOURCE', dataSourceId: input.dataSourceId }
        : { kind: 'MANUAL' }
      : input.source ?? { kind: 'MANUAL' }
  const sourceKind: InputSource['kind'] = source.kind

  // Flat list of all predecessor outputs, grouped per predecessor in the
  // dropdown. We encode the selection as `${nodeId}::${outputId}` so a single
  // pick fully resolves the binding (no cascading dropdowns).
  const predecessorOutputsFlat = useMemo(() => {
    return predecessorNodes.map((p) => ({
      node: p,
      outputs: p.outputs ?? [],
    }))
  }, [predecessorNodes])
  const predecessorValue =
    source.kind === 'PREDECESSOR' && source.from.nodeId && source.from.outputId
      ? `${source.from.nodeId}::${source.from.outputId}`
      : '__pick'

  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2 space-y-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={input.name ?? input.label ?? ''}
          onChange={(e) => onChange({ name: e.target.value, label: e.target.value })}
          className="h-6 text-[11px] flex-1"
          placeholder="Input name"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onRemove}
          aria-label={`Remove input ${input.name || index + 1}`}
          title="Remove input"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>

      <Textarea
        value={input.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        className="text-[10px] min-h-[40px]"
        placeholder="What is this input? (optional)"
      />

      <div className="grid grid-cols-2 gap-2">
        <Select value={sourceKind} onValueChange={(v) => {
          if (v === 'MANUAL') onSetSource({ kind: 'MANUAL' })
          else if (v === 'PREDECESSOR') onSetSource({ kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } })
          else if (v === 'DATASOURCE') onSetSource({ kind: 'DATASOURCE', dataSourceId: '' })
        }}>
          <SelectTrigger className="h-6 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MANUAL">Manual upload</SelectItem>
            <SelectItem value="PREDECESSOR">From predecessor</SelectItem>
            <SelectItem value="DATASOURCE">Data source</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={input.cardinality ?? Cardinality.ONE}
          onValueChange={(v) => onChange({ cardinality: v as typeof Cardinality[keyof typeof Cardinality] })}
        >
          <SelectTrigger className="h-6 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={Cardinality.ONE}>Single file</SelectItem>
            <SelectItem value={Cardinality.MANY}>Multiple files</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {source.kind === 'PREDECESSOR' && (() => {
        const totalOutputs = predecessorOutputsFlat.reduce((acc, p) => acc + p.outputs.length, 0)
        const predecessorsWithoutOutputs = predecessorOutputsFlat.filter((p) => p.outputs.length === 0)
        return (
          <div className="space-y-1.5">
            <Select
              value={predecessorValue}
              onValueChange={(v) => {
                if (v === '__pick') return
                const [nodeId, outputId] = v.split('::')
                // Look up the upstream output so we can mirror its contract
                // (name, description, fileTypes, cardinality) onto this input.
                // The user picked this binding deliberately, so the upstream
                // contract is the most authoritative default - they can still
                // tweak any field afterwards.
                const pred = predecessorOutputsFlat.find((p) => p.node.id === nodeId)
                const upstreamOut = pred?.outputs.find((o) => o.id === outputId)
                if (upstreamOut) {
                  onChange({
                    source: { kind: 'PREDECESSOR', from: { nodeId, outputId } },
                    name: upstreamOut.name ?? upstreamOut.label ?? upstreamOut.id,
                    description: upstreamOut.description,
                    fileTypes: upstreamOut.fileTypes ?? [],
                    cardinality: upstreamOut.cardinality ?? Cardinality.ONE,
                  })
                } else {
                  // Defensive: upstream not found (race or stale store) -
                  // still record the binding so the UI doesn't lock up.
                  onSetSource({ kind: 'PREDECESSOR', from: { nodeId, outputId } })
                }
              }}
            >
              <SelectTrigger className="h-7 text-[10px]">
                <SelectValue placeholder="Select predecessor output…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__pick" disabled>Select predecessor output…</SelectItem>
                {predecessorOutputsFlat.length === 0 && (
                  <SelectItem value="__none" disabled>
                    No incoming edges - connect this node first
                  </SelectItem>
                )}
                {predecessorOutputsFlat.length > 0 && totalOutputs === 0 && (
                  <SelectItem value="__none" disabled>
                    Predecessors have no outputs declared yet
                  </SelectItem>
                )}
                {predecessorOutputsFlat.map((p) =>
                  p.outputs.length === 0 ? null : (
                    <SelectGroup key={p.node.id}>
                      <SelectLabel className="text-[9px] text-muted-foreground">
                        {nodeDisplayName(p.node)}
                      </SelectLabel>
                      {p.outputs.map((o) => (
                        <SelectItem
                          key={`${p.node.id}::${o.id}`}
                          value={`${p.node.id}::${o.id}`}
                          className="text-[11px]"
                        >
                          {o.name ?? o.label ?? o.id}
                          {o.fileTypes && o.fileTypes.length > 0
                            ? `  · ${o.fileTypes.join(', ')}`
                            : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ),
                )}
              </SelectContent>
            </Select>

            {/* Inline hint when an edge is connected but the upstream node has
                no outputs declared yet - guides the user to fix the contract. */}
            {predecessorsWithoutOutputs.length > 0 && (
              <p className="text-[9px] text-amber-500/90">
                Missing outputs on:{' '}
                {predecessorsWithoutOutputs
                  .map((p) => nodeDisplayName(p.node))
                  .join(', ')}
                . Open that node and add an output first.
              </p>
            )}
          </div>
        )
      })()}

      {source.kind === 'DATASOURCE' && (
        <div className="flex items-center gap-1.5">
          <Database className="h-3 w-3 text-muted-foreground" />
          <Select
            value={source.dataSourceId || '__pick'}
            onValueChange={(v) => onSetSource({ kind: 'DATASOURCE', dataSourceId: v })}
          >
            <SelectTrigger className="h-6 text-[10px] flex-1">
              <SelectValue placeholder="Select data source…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__pick" disabled>Select data source…</SelectItem>
              {dataSources.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Accepted file types</Label>
        <Input
          value={(input.fileTypes ?? []).join(', ')}
          onChange={(e) => onChange({ fileTypes: uniqExtensions(e.target.value) })}
          className="h-6 text-[10px] font-mono"
          placeholder=".step, .iges, .pdf"
        />
        {(input.fileTypes ?? []).length === 0 && (
          <p className="text-[9px] text-amber-500/80">No filter - any extension accepted</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant={input.required ? 'default' : 'outline'}
          size="sm"
          className="h-6 text-[9px] px-2"
          onClick={() => onChange({ required: !input.required })}
        >
          {input.required ? 'Required' : 'Optional'}
        </Button>
        <span className="text-[9px] font-mono text-muted-foreground">id: {input.id}</span>
      </div>
    </div>
  )
}

// ─── OutputEditor ───────────────────────────────────────────────────────────

interface OutputEditorProps {
  output: NodeOutputDef
  index: number
  onChange: (updates: Partial<NodeOutputDef>) => void
  onRemove: () => void
}

function OutputEditor({ output, index, onChange, onRemove }: OutputEditorProps) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2 space-y-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={output.name ?? output.label ?? ''}
          onChange={(e) => onChange({ name: e.target.value, label: e.target.value })}
          className="h-6 text-[11px] flex-1"
          placeholder="Output name"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onRemove}
          aria-label={`Remove output ${output.name || index + 1}`}
          title="Remove output"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>

      <Textarea
        value={output.description ?? ''}
        onChange={(e) => onChange({ description: e.target.value })}
        className="text-[10px] min-h-[40px]"
        placeholder="What is produced here? (optional)"
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          value={output.cardinality ?? Cardinality.ONE}
          onValueChange={(v) => onChange({ cardinality: v as typeof Cardinality[keyof typeof Cardinality] })}
        >
          <SelectTrigger className="h-6 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={Cardinality.ONE}>Single file</SelectItem>
            <SelectItem value={Cardinality.MANY}>Multiple files</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={output.required ? 'default' : 'outline'}
          size="sm"
          className="h-6 text-[9px] px-2"
          onClick={() => onChange({ required: !output.required })}
        >
          {output.required ? 'Required' : 'Optional'}
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Accepted file types on upload</Label>
        <Input
          value={(output.fileTypes ?? []).join(', ')}
          onChange={(e) => onChange({ fileTypes: uniqExtensions(e.target.value) })}
          className="h-6 text-[10px] font-mono"
          placeholder=".pdf, .json, .xlsx"
        />
        {(output.fileTypes ?? []).length === 0 && (
          <p className="text-[9px] text-amber-500/80">No filter - any extension accepted</p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Label className="text-[10px] text-muted-foreground">Default classification</Label>
          <ClassificationInfoButton ariaLabel="About classification levels" />
        </div>
        <Select
          value={output.defaultClassification ?? '__inherit'}
          onValueChange={(v) =>
            onChange({
              defaultClassification:
                v === '__inherit' ? undefined : (v as Classification),
            })
          }
        >
          <SelectTrigger className="h-6 text-[10px]">
            <SelectValue placeholder="Inherit (INTERNAL)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__inherit" className="text-[10px]">
              Inherit - INTERNAL
            </SelectItem>
            {CLASSIFICATION_LIST.map((c) => (
              <SelectItem key={c} value={c} className="text-[10px]">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[9px] text-muted-foreground/70">
          Suggested at upload time; the partner can override.
        </p>
      </div>

      <p className="text-[9px] font-mono text-muted-foreground">id: {output.id}</p>
    </div>
  )
}
