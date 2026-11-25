import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { WORK_TYPE_LIST } from '@/lib/normalize-node'
import { MwdDownloadMenu, type MwdFormat } from '@/components/common/mwd-download-menu'
import type {
  WorkDescriptionDef,
  WorkParameterSpec,
  WorkResourceSpec,
  WorkType,
} from '@/types/state-machine'

/**
 * Editor for the optional ISA-95 / IDTA 02100 "Manufacturing Work Description"
 * carried by a TASK node (`FlowNodeDef.work`). Lives in its own file so the
 * node properties panel stays readable; the panel owns the store mutation and
 * simply passes `onChange` through `onUpdateNode(node.id, { work })`.
 *
 * Rows are updated with `{ ...row, ...patch }`, so the nested `properties`
 * list (not editable here yet) is preserved untouched.
 */

interface WorkDescriptionEditorProps {
  work: WorkDescriptionDef | undefined
  onChange: (next: WorkDescriptionDef) => void
  /**
   * Per-node MWD download (machine-level AAS routes). Omitted → no control.
   * The backend exports what is persisted, so the owner passes
   * `disabledReason` while the editor has unsaved changes.
   */
  download?: {
    onDownload: (format: MwdFormat) => void | Promise<void>
    disabledReason?: string
  }
}

type ResourceListKey = 'personnel' | 'equipment' | 'physicalAssets' | 'materials'
type SectionKey = 'parameters' | ResourceListKey

/** Radix Select cannot hold an empty value; this sentinel stands for "not set". */
const UNSET = '__unset'

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  production: 'Production',
  maintenance: 'Maintenance',
  quality: 'Quality',
  inventory: 'Inventory',
  mixed: 'Mixed',
}

const RESOURCE_SECTIONS: ReadonlyArray<{
  key: ResourceListKey
  title: string
  idPrefix: string
  hint: string
}> = [
  { key: 'personnel', title: 'Personnel', idPrefix: 'per', hint: 'PersonnelClass / Person' },
  { key: 'equipment', title: 'Equipment', idPrefix: 'eq', hint: 'EquipmentClass / Equipment' },
  { key: 'physicalAssets', title: 'Physical assets', idPrefix: 'pa', hint: 'PhysicalAssetClass / PhysicalAsset' },
  { key: 'materials', title: 'Materials', idPrefix: 'mat', hint: 'MaterialClass / MaterialDefinition' },
]

/** Short local id (`<prefix>-xxxxxx`), re-rolled until unique within `taken`. Ids stay editable. */
function newLocalId(prefix: string, taken: ReadonlySet<string>): string {
  let id: string
  do {
    id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`
  } while (taken.has(id))
  return id
}

/** Empty string → undefined so cleared fields disappear from the saved JSON. */
function text(v: string): string | undefined {
  return v === '' ? undefined : v
}

export function WorkDescriptionEditor({ work, onChange, download }: WorkDescriptionEditorProps) {
  const w: WorkDescriptionDef = work ?? {}
  const parameters = w.parameters ?? []

  // Sections start open when they already hold rows, collapsed otherwise;
  // adding a row always opens its section so the new row is visible.
  const [open, setOpen] = useState<Record<SectionKey, boolean>>(() => ({
    parameters: parameters.length > 0,
    personnel: (w.personnel ?? []).length > 0,
    equipment: (w.equipment ?? []).length > 0,
    physicalAssets: (w.physicalAssets ?? []).length > 0,
    materials: (w.materials ?? []).length > 0,
  }))
  const toggle = (key: SectionKey) => setOpen((s) => ({ ...s, [key]: !s[key] }))
  const show = (key: SectionKey) => setOpen((s) => (s[key] ? s : { ...s, [key]: true }))

  const patch = (updates: Partial<WorkDescriptionDef>) => onChange({ ...w, ...updates })

  // --- Parameters ---
  const writeParameters = (next: WorkParameterSpec[]) => patch({ parameters: next })
  const addParameter = () => {
    const id = newLocalId('par', new Set(parameters.map((p) => p.id)))
    writeParameters([...parameters, { id, value: '' }])
    show('parameters')
  }
  const updateParameter = (index: number, updates: Partial<WorkParameterSpec>) =>
    writeParameters(parameters.map((p, i) => (i === index ? { ...p, ...updates } : p)))
  const removeParameter = (index: number) => writeParameters(parameters.filter((_, i) => i !== index))

  // --- Resources (personnel / equipment / physical assets / materials) ---
  const resources = (key: ResourceListKey): WorkResourceSpec[] => w[key] ?? []
  const writeResources = (key: ResourceListKey, next: WorkResourceSpec[]) => patch({ [key]: next })
  const addResource = (key: ResourceListKey, idPrefix: string) => {
    const list = resources(key)
    const id = newLocalId(idPrefix, new Set(list.map((r) => r.id)))
    writeResources(key, [...list, { id }])
    show(key)
  }
  const updateResource = (key: ResourceListKey, index: number, updates: Partial<WorkResourceSpec>) =>
    writeResources(key, resources(key).map((r, i) => (i === index ? { ...r, ...updates } : r)))
  const removeResource = (key: ResourceListKey, index: number) =>
    writeResources(key, resources(key).filter((_, i) => i !== index))

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground">
        Exported as an IDTA 02100 Manufacturing Work Description submodel
      </p>

      {download && (
        <MwdDownloadMenu onDownload={download.onDownload} disabledReason={download.disabledReason} />
      )}

      {/* Header fields */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Work type">
          <Select
            value={w.workType ?? UNSET}
            onValueChange={(v) => patch({ workType: v === UNSET ? undefined : (v as WorkType) })}
          >
            <SelectTrigger className="h-6 w-full text-[10px]" aria-label="Work type">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET} className="text-[10px]">Not set</SelectItem>
              {WORK_TYPE_LIST.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">{WORK_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Hierarchy scope">
          <Input
            value={w.hierarchyScope ?? ''}
            onChange={(e) => patch({ hierarchyScope: text(e.target.value) })}
            className="h-6 text-[10px]"
            placeholder="Site / Area / Work center"
          />
        </Field>
        <Field label="Duration">
          <Input
            value={w.duration ?? ''}
            onChange={(e) => patch({ duration: text(e.target.value) })}
            className="h-6 text-[10px]"
            placeholder="e.g. 45"
          />
        </Field>
        <Field label="Duration unit">
          <Input
            value={w.durationUnit ?? ''}
            onChange={(e) => patch({ durationUnit: text(e.target.value) })}
            className="h-6 text-[10px]"
            placeholder="min, h, d"
          />
        </Field>
      </div>

      <Separator />

      {/* Parameters */}
      <CollapsibleSection
        title="Parameters"
        hint="Parameter specification"
        count={parameters.length}
        open={open.parameters}
        onToggle={() => toggle('parameters')}
        onAdd={addParameter}
        addLabel="Add parameter"
      >
        {parameters.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No parameters defined</p>
        ) : (
          parameters.map((p, i) => (
            <ParameterRow
              key={i}
              param={p}
              index={i}
              onChange={(updates) => updateParameter(i, updates)}
              onRemove={() => removeParameter(i)}
            />
          ))
        )}
      </CollapsibleSection>

      {/* Resources */}
      {RESOURCE_SECTIONS.map((section) => {
        const list = resources(section.key)
        return (
          <CollapsibleSection
            key={section.key}
            title={section.title}
            hint={section.hint}
            count={list.length}
            open={open[section.key]}
            onToggle={() => toggle(section.key)}
            onAdd={() => addResource(section.key, section.idPrefix)}
            addLabel={`Add ${section.title.toLowerCase()} entry`}
          >
            {list.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">No {section.title.toLowerCase()} defined</p>
            ) : (
              list.map((r, i) => (
                <ResourceRow
                  key={i}
                  resource={r}
                  index={i}
                  sectionTitle={section.title}
                  material={section.key === 'materials'}
                  onChange={(updates) => updateResource(section.key, i, updates)}
                  onRemove={() => removeResource(section.key, i)}
                />
              ))
            )}
          </CollapsibleSection>
        )
      })}
    </div>
  )
}

// ─── Building blocks ─────────────────────────────────────────────────────────

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-1 min-w-0', className)}>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

interface CollapsibleSectionProps {
  title: string
  hint?: string
  count: number
  open: boolean
  onToggle: () => void
  onAdd: () => void
  addLabel: string
  children: ReactNode
}

function CollapsibleSection({ title, hint, count, open, onToggle, onAdd, addLabel, children }: CollapsibleSectionProps) {
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div className="rounded-md border border-border/50">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 min-w-0 items-center gap-1.5 text-left"
        >
          <Chevron className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-semibold">{title}</span>
          <Badge variant="outline" className="h-4 px-1 text-[9px]">{count}</Badge>
          {hint && <span className="text-[9px] text-muted-foreground truncate">{hint}</span>}
        </button>
        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={onAdd} aria-label={addLabel} title={addLabel}>
          <Plus className="h-3 w-3 mr-0.5" aria-hidden="true" />
          Add
        </Button>
      </div>
      {open && <div className="space-y-2 px-2 pb-2">{children}</div>}
    </div>
  )
}

interface ParameterRowProps {
  param: WorkParameterSpec
  index: number
  onChange: (updates: Partial<WorkParameterSpec>) => void
  onRemove: () => void
}

function ParameterRow({ param, index, onChange, onRemove }: ParameterRowProps) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2 space-y-2">
      <div className="flex items-end gap-1.5">
        <Field label="Id" className="flex-1">
          <Input
            value={param.id}
            onChange={(e) => onChange({ id: e.target.value })}
            className="h-6 text-[10px] font-mono"
            placeholder="parameter id"
          />
        </Field>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onRemove}
          aria-label={`Remove parameter ${param.id || index + 1}`}
          title="Remove parameter"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Value">
          <Input
            value={param.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            className="h-6 text-[10px]"
          />
        </Field>
        <Field label="Value unit">
          <Input
            value={param.valueUnit ?? ''}
            onChange={(e) => onChange({ valueUnit: text(e.target.value) })}
            className="h-6 text-[10px]"
            placeholder="mm, °C, ..."
          />
        </Field>
      </div>
      <Field label="Description">
        <Textarea
          value={param.description ?? ''}
          onChange={(e) => onChange({ description: text(e.target.value) })}
          className="text-[10px] min-h-[36px]"
          placeholder="What does this parameter control? (optional)"
        />
      </Field>
    </div>
  )
}

interface ResourceRowProps {
  resource: WorkResourceSpec
  index: number
  sectionTitle: string
  /** Materials carry the two assembly fields; the other resource kinds do not. */
  material: boolean
  onChange: (updates: Partial<WorkResourceSpec>) => void
  onRemove: () => void
}

function ResourceRow({ resource, index, sectionTitle, material, onChange, onRemove }: ResourceRowProps) {
  const nested = resource.properties?.length ?? 0
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2 space-y-2">
      <div className="flex items-end gap-1.5">
        <Field label="Id" className="flex-1">
          <Input
            value={resource.id}
            onChange={(e) => onChange({ id: e.target.value })}
            className="h-6 text-[10px] font-mono"
            placeholder="resource id"
          />
        </Field>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onRemove}
          aria-label={`Remove ${sectionTitle.toLowerCase()} entry ${resource.id || index + 1}`}
          title="Remove entry"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
      <Field label="Class reference">
        <Input
          value={resource.classRef ?? ''}
          onChange={(e) => onChange({ classRef: text(e.target.value) })}
          className="h-6 text-[10px] font-mono"
          placeholder="IRI / URN of the class"
        />
      </Field>
      <Field label="Object reference">
        <Input
          value={resource.objectRef ?? ''}
          onChange={(e) => onChange({ objectRef: text(e.target.value) })}
          className="h-6 text-[10px] font-mono"
          placeholder="IRI / URN of the concrete object"
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Use">
          <Input
            value={resource.use ?? ''}
            onChange={(e) => onChange({ use: text(e.target.value) })}
            className="h-6 text-[10px]"
            placeholder="e.g. Consumed"
          />
        </Field>
        <Field label="Quantity">
          <Input
            value={resource.quantity ?? ''}
            onChange={(e) => onChange({ quantity: text(e.target.value) })}
            className="h-6 text-[10px]"
          />
        </Field>
        <Field label="Quantity unit">
          <Input
            value={resource.quantityUnit ?? ''}
            onChange={(e) => onChange({ quantityUnit: text(e.target.value) })}
            className="h-6 text-[10px]"
            placeholder="pcs, kg, h"
          />
        </Field>
      </div>
      {material && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Assembly type">
            <Select
              value={resource.assemblyType ?? UNSET}
              onValueChange={(v) =>
                onChange({ assemblyType: v === UNSET ? undefined : (v as WorkResourceSpec['assemblyType']) })
              }
            >
              <SelectTrigger className="h-6 w-full text-[10px]" aria-label="Assembly type">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET} className="text-[10px]">Not set</SelectItem>
                <SelectItem value="physical" className="text-[10px]">Physical</SelectItem>
                <SelectItem value="logical" className="text-[10px]">Logical</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Assembly relationship">
            <Select
              value={resource.assemblyRelationship ?? UNSET}
              onValueChange={(v) =>
                onChange({
                  assemblyRelationship:
                    v === UNSET ? undefined : (v as WorkResourceSpec['assemblyRelationship']),
                })
              }
            >
              <SelectTrigger className="h-6 w-full text-[10px]" aria-label="Assembly relationship">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET} className="text-[10px]">Not set</SelectItem>
                <SelectItem value="permanent" className="text-[10px]">Permanent</SelectItem>
                <SelectItem value="transient" className="text-[10px]">Transient</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
      <Field label="Description">
        <Textarea
          value={resource.description ?? ''}
          onChange={(e) => onChange({ description: text(e.target.value) })}
          className="text-[10px] min-h-[36px]"
          placeholder="Role of this resource in the work (optional)"
        />
      </Field>
      {nested > 0 && (
        <p className="text-[9px] text-muted-foreground">
          {nested} nested {nested === 1 ? 'property' : 'properties'} preserved (not editable here yet)
        </p>
      )}
    </div>
  )
}
