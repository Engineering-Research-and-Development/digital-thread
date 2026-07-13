import { useEffect, useMemo, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Plus, Pencil, Trash2, X, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { useNodeTemplateStore } from '@/stores/node-template-store'
import { usePartnerStore } from '@/stores/partner-store'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/sonner'
import { Cardinality, NodeKind } from '@/types/enums'
import type { NodeTemplate } from '@/lib/api'

interface TemplateInput {
  id: string
  name: string
  source: 'MANUAL' | 'PREDECESSOR' | 'DATASOURCE'
  required: boolean
  cardinality: 'ONE' | 'MANY'
  fileTypes: string[]
  description?: string
}

interface TemplateOutput {
  id: string
  name: string
  required: boolean
  cardinality: 'ONE' | 'MANY'
  fileTypes: string[]
  description?: string
}

interface FormState {
  id?: string
  slug: string
  label: string
  kind: NodeTemplate['kind']
  icon: string
  color: string
  description: string
  tags: string[]
  defaultPartnerId: string | null
  sortOrder: number
  enabled: boolean
  inputs: TemplateInput[]
  outputs: TemplateOutput[]
}

const EMPTY: FormState = {
  slug: '',
  label: '',
  kind: NodeKind.TASK,
  icon: 'Box',
  color: '#3B82F6',
  description: '',
  tags: [],
  defaultPartnerId: null,
  sortOrder: 100,
  enabled: true,
  inputs: [],
  outputs: [],
}

function normaliseExtensions(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .map((e) => (e.startsWith('.') ? e : `.${e}`)),
    ),
  )
}

function fromTemplate(t: NodeTemplate): FormState {
  return {
    id: t.id,
    slug: t.slug,
    label: t.label,
    kind: t.kind,
    icon: t.icon,
    color: t.color,
    description: t.description,
    tags: t.tags ?? [],
    defaultPartnerId: t.defaultPartnerId ?? null,
    sortOrder: t.sortOrder,
    enabled: t.enabled,
    inputs: (t.inputs ?? []).map((raw: any, i: number) => ({
      id: String(raw?.id ?? `in-${i + 1}`),
      name: String(raw?.name ?? raw?.label ?? raw?.id ?? `Input ${i + 1}`),
      source:
        typeof raw?.source === 'object' && raw?.source?.kind
          ? (raw.source.kind as 'MANUAL' | 'PREDECESSOR' | 'DATASOURCE')
          : (typeof raw?.source === 'string' ? raw.source : 'MANUAL'),
      required: Boolean(raw?.required),
      cardinality: raw?.cardinality === 'MANY' ? 'MANY' : 'ONE',
      fileTypes: Array.isArray(raw?.fileTypes) ? raw.fileTypes.map(String) : [],
      description: typeof raw?.description === 'string' ? raw.description : undefined,
    })),
    outputs: (t.outputs ?? []).map((raw: any, i: number) => ({
      id: String(raw?.id ?? `out-${i + 1}`),
      name: String(raw?.name ?? raw?.label ?? raw?.id ?? `Output ${i + 1}`),
      required: Boolean(raw?.required),
      cardinality: raw?.cardinality === 'MANY' ? 'MANY' : 'ONE',
      fileTypes: Array.isArray(raw?.fileTypes) ? raw.fileTypes.map(String) : [],
      description: typeof raw?.description === 'string' ? raw.description : undefined,
    })),
  }
}

function toPayload(f: FormState): Partial<NodeTemplate> {
  return {
    slug: f.slug,
    label: f.label,
    kind: f.kind,
    icon: f.icon,
    color: f.color,
    description: f.description,
    tags: f.tags,
    defaultPartnerId: f.defaultPartnerId,
    sortOrder: f.sortOrder,
    enabled: f.enabled,
    inputs: f.inputs.map((i) => ({
      id: i.id,
      name: i.name,
      cardinality: i.cardinality,
      required: i.required,
      fileTypes: i.fileTypes,
      description: i.description,
      source:
        i.source === 'PREDECESSOR'
          ? { kind: 'PREDECESSOR', from: { nodeId: '', outputId: '' } }
          : i.source === 'DATASOURCE'
            ? { kind: 'DATASOURCE', dataSourceId: '' }
            : { kind: 'MANUAL' },
    })),
    outputs: f.outputs.map((o) => ({
      id: o.id,
      name: o.name,
      cardinality: o.cardinality,
      required: o.required,
      fileTypes: o.fileTypes,
      description: o.description,
    })),
  }
}

export function NodeTemplatesTab() {
  const { templates, init, create, update, remove } = useNodeTemplateStore()
  const partners = usePartnerStore((s) => s.partners)
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const partnerList = useMemo(() => Object.values(partners), [partners])

  useEffect(() => { init() }, [init])

  const openCreate = () => { setForm({ ...EMPTY }); setDialogOpen(true) }
  const openEdit = (t: NodeTemplate) => { setForm(fromTemplate(t)); setDialogOpen(true) }

  const handleSave = async () => {
    if (!form.label.trim()) { toast.error('Label is required'); return }
    try {
      const payload = toPayload(form)
      if (form.id) {
        await update(form.id, payload)
        toast.success(`Template "${form.label}" updated`)
      } else {
        await create(payload)
        toast.success(`Template "${form.label}" created`)
      }
      setDialogOpen(false)
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? 'unknown error'}`)
    }
  }

  const handleDelete = async (t: NodeTemplate) => {
    const ok = await confirm({
      title: 'Delete template?',
      description: `"${t.label}" will be removed from the palette. State machines that already use this template are unaffected.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await remove(t.id)
      toast.success('Template deleted')
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message ?? 'unknown error'}`)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Node templates</p>
          <p className="text-xs text-muted-foreground">
            Pre-configured palette entries with concrete inputs/outputs and file-type whitelists. Shown in the editor under "Domain templates".
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New template
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Label</TableHead>
            <TableHead className="w-[20%]">Slug</TableHead>
            <TableHead>Default partner</TableHead>
            <TableHead className="text-right">Inputs</TableHead>
            <TableHead className="text-right">Outputs</TableHead>
            <TableHead className="text-right">Enabled</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-6">
                No templates yet. Click "New template" to create one.
              </TableCell>
            </TableRow>
          )}
          {templates.map((t) => {
            const partner = t.defaultPartnerId ? partnerList.find((p) => p.id === t.defaultPartnerId) : null
            return (
              <TableRow key={t.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-5 rounded" style={{ backgroundColor: t.color }} />
                    <span className="font-medium text-sm">{t.label}</span>
                    {!t.enabled && <Badge variant="outline" className="text-[9px]">disabled</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 max-w-md">{t.description}</p>
                </TableCell>
                <TableCell><code className="text-[10px] font-mono text-muted-foreground">{t.slug}</code></TableCell>
                <TableCell>
                  {partner ? (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: partner.color }} />
                      {partner.name}
                    </span>
                  ) : <span className="text-[10px] text-muted-foreground italic">none</span>}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{t.inputs.length}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{t.outputs.length}</TableCell>
                <TableCell className="text-right">
                  {t.enabled
                    ? <Badge variant="default" className="text-[9px]">on</Badge>
                    : <Badge variant="outline" className="text-[9px]">off</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(t)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        partners={partnerList}
        onSave={handleSave}
      />
    </div>
  )
}

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: FormState
  setForm: (f: FormState) => void
  partners: Array<{ id: string; name: string; color: string }>
  onSave: () => void
}

function TemplateDialog({ open, onOpenChange, form, setForm, partners, onSave }: TemplateDialogProps) {
  const update = (patch: Partial<FormState>) => setForm({ ...form, ...patch })

  const addInput = () => update({
    inputs: [...form.inputs, {
      id: `in-${form.inputs.length + 1}`,
      name: 'New input',
      source: 'MANUAL',
      required: true,
      cardinality: 'ONE',
      fileTypes: [],
    }],
  })
  const updateInput = (i: number, patch: Partial<TemplateInput>) =>
    update({ inputs: form.inputs.map((inp, idx) => idx === i ? { ...inp, ...patch } : inp) })
  const removeInput = (i: number) =>
    update({ inputs: form.inputs.filter((_, idx) => idx !== i) })

  const addOutput = () => update({
    outputs: [...form.outputs, {
      id: `out-${form.outputs.length + 1}`,
      name: 'New output',
      required: false,
      cardinality: 'ONE',
      fileTypes: [],
    }],
  })
  const updateOutput = (i: number, patch: Partial<TemplateOutput>) =>
    update({ outputs: form.outputs.map((out, idx) => idx === i ? { ...out, ...patch } : out) })
  const removeOutput = (i: number) =>
    update({ outputs: form.outputs.filter((_, idx) => idx !== i) })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit template' : 'New template'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={form.label} onChange={(e) => update({ label: e.target.value })} placeholder="e.g. CAD Release" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Slug</Label>
            <Input
              value={form.slug}
              onChange={(e) => update({ slug: e.target.value })}
              placeholder="auto from label"
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea value={form.description} onChange={(e) => update({ description: e.target.value })} className="text-xs min-h-[60px]" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Kind</Label>
            <Select value={form.kind} onValueChange={(v) => update({ kind: v as NodeTemplate['kind'] })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NodeKind.TRIGGER}>Trigger</SelectItem>
                <SelectItem value={NodeKind.TASK}>Task</SelectItem>
                <SelectItem value={NodeKind.GATEWAY}>Gateway</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Icon (lucide name)</Label>
            <Input value={form.icon} onChange={(e) => update({ icon: e.target.value })} className="font-mono text-xs" placeholder="Box" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex gap-1.5 items-center">
              <input type="color" value={form.color} onChange={(e) => update({ color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-input" />
              <Input value={form.color} onChange={(e) => update({ color: e.target.value })} className="font-mono text-xs flex-1" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Default partner</Label>
            <Select value={form.defaultPartnerId ?? '__none'} onValueChange={(v) => update({ defaultPartnerId: v === '__none' ? null : v })}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sort order</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => update({ sortOrder: Number(e.target.value) || 0 })}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input
              value={form.tags.join(', ')}
              onChange={(e) => update({ tags: Array.from(new Set(e.target.value.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean))) })}
              className="text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={form.enabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => update({ enabled: !form.enabled })}
          >
            {form.enabled ? 'Enabled (visible in palette)' : 'Disabled (hidden)'}
          </Button>
        </div>

        <Separator />

        {/* ── Inputs ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400">Inputs</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={addInput}>
              <Plus className="h-3 w-3 mr-1" /> Add input
            </Button>
          </div>
          {form.inputs.length === 0 && <p className="text-[11px] italic text-muted-foreground">No inputs declared.</p>}
          <div className="space-y-2">
            {form.inputs.map((inp, i) => (
              <div key={i} className="rounded-md border border-border/50 bg-muted/15 p-2 space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
                  <div>
                    <Label className="text-[10px]">id (stable)</Label>
                    <Input className="h-7 text-[11px] font-mono" value={inp.id} onChange={(e) => updateInput(i, { id: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">name</Label>
                    <Input className="h-7 text-[11px]" value={inp.name} onChange={(e) => updateInput(i, { name: e.target.value })} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeInput(i)} title="Remove">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Select value={inp.source} onValueChange={(v) => updateInput(i, { source: v as TemplateInput['source'] })}>
                    <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANUAL">Manual upload</SelectItem>
                      <SelectItem value="PREDECESSOR">From predecessor</SelectItem>
                      <SelectItem value="DATASOURCE">Data source</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={inp.cardinality} onValueChange={(v) => updateInput(i, { cardinality: v as 'ONE'|'MANY' })}>
                    <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Cardinality.ONE}>Single file</SelectItem>
                      <SelectItem value={Cardinality.MANY}>Multiple files</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant={inp.required ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => updateInput(i, { required: !inp.required })}
                  >
                    {inp.required ? 'Required' : 'Optional'}
                  </Button>
                </div>
                <Input
                  className="h-7 text-[11px] font-mono"
                  value={inp.fileTypes.join(', ')}
                  onChange={(e) => updateInput(i, { fileTypes: normaliseExtensions(e.target.value) })}
                  placeholder="Accepted file extensions: .step, .pdf, …"
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* ── Outputs ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <ArrowUpFromLine className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">Outputs</span>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={addOutput}>
              <Plus className="h-3 w-3 mr-1" /> Add output
            </Button>
          </div>
          {form.outputs.length === 0 && <p className="text-[11px] italic text-muted-foreground">No outputs declared.</p>}
          <div className="space-y-2">
            {form.outputs.map((out, i) => (
              <div key={i} className="rounded-md border border-border/50 bg-muted/15 p-2 space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
                  <div>
                    <Label className="text-[10px]">id (stable - referenced by downstream)</Label>
                    <Input className="h-7 text-[11px] font-mono" value={out.id} onChange={(e) => updateOutput(i, { id: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-[10px]">name</Label>
                    <Input className="h-7 text-[11px]" value={out.name} onChange={(e) => updateOutput(i, { name: e.target.value })} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeOutput(i)} title="Remove">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Select value={out.cardinality} onValueChange={(v) => updateOutput(i, { cardinality: v as 'ONE'|'MANY' })}>
                    <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Cardinality.ONE}>Single file</SelectItem>
                      <SelectItem value={Cardinality.MANY}>Multiple files</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant={out.required ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => updateOutput(i, { required: !out.required })}
                  >
                    {out.required ? 'Required' : 'Optional'}
                  </Button>
                </div>
                <Input
                  className="h-7 text-[11px] font-mono"
                  value={out.fileTypes.join(', ')}
                  onChange={(e) => updateOutput(i, { fileTypes: normaliseExtensions(e.target.value) })}
                  placeholder="Accepted file extensions: .pdf, .json, …"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave}>{form.id ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
