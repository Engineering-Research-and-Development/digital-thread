/**
 * TASK node ⇄ IDTA 02100 Manufacturing Work Description submodel.
 *
 * `buildMwdSubmodel` is used by the Type-level export (one MWD per TASK node of
 * a machine, DefinitionType 'pattern') and by the Instance-level export (one
 * MWD per TASK node of an iteration's frozen version, DefinitionType
 * 'instance'). `readMwd` is the inverse used by the importer. Element layout,
 * idShorts and semanticIds come from mwd-spec.ts; see
 * docs/idta-02100/tools/build_mwd_instances.py for the prototype this mirrors.
 */

import type {
  FlowNodeDef,
  WorkDescriptionDef,
  WorkParameterSpec,
  WorkResourceSpec,
  WorkSpecProperty,
} from '@/iterations/types/flow-node'
import { normalizeWorkDescription } from '@/iterations/normalize-node'
import {
  elementsOf,
  en,
  extRef,
  findBySemanticId,
  findElement,
  idShortKey,
  mlp,
  prop,
  propValue,
  refEl,
  refTarget,
  semanticIdOf,
  sml,
  smc,
  toXsDateTime,
} from './aas-core.util'
import {
  MWD_LISTS,
  MWD_RESOURCE_LISTS,
  MWD_ROOT,
  MWD_TEMPLATE_ID,
  mwdSem,
  type MwdResourceListId,
} from './mwd-spec'

/** PersonnelClass of a PersonnelSpecification derived from a responsible partner. */
export const PARTNER_URN_PREFIX = 'urn:digitalthread:partner:'
/** Person of a PersonnelSpecification derived from the user who claimed the node. */
export const USER_URN_PREFIX = 'urn:digitalthread:user:'
export const RESPONSIBLE_PARTNER_USE = 'responsible partner'
export const CLAIMANT_USE = 'claimant'

const RESOURCE_LIST_IDS = Object.keys(MWD_RESOURCE_LISTS) as MwdResourceListId[]
const RESOURCE_ID_PREFIX: Record<MwdResourceListId, string> = {
  PersonnelSpecifications: 'personnel',
  EquipmentSpecifications: 'equipment',
  PhysicalAssetSpecifications: 'physicalAsset',
  MaterialSpecifications: 'material',
}

// ─── Identifiers ─────────────────────────────────────────────────────────────

export function mwdSubmodelIdForMachine(machineId: string, nodeId: string): string {
  return `urn:digitalthread:sm:mwd:${machineId}:${nodeId}`
}

export function mwdSubmodelIdForIteration(iterationId: string, nodeId: string): string {
  return `urn:digitalthread:sm:mwd:iteration:${iterationId}:${nodeId}`
}

export function mwdIdShort(nodeId: string): string {
  return `MWD_${String(nodeId).replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 128)
}

/** PersonnelSpecification derived from a responsible partner id (no `work.personnel`). */
export function partnerPersonnel(partnerId: string): WorkResourceSpec {
  return { id: `partner-${partnerId}`, classRef: `${PARTNER_URN_PREFIX}${partnerId}`, use: RESPONSIBLE_PARTNER_USE }
}

/** PersonnelSpecification for the user (by id, never by email) who claimed the node. */
export function claimantPersonnel(userId: string): WorkResourceSpec {
  return { id: `claimant-${userId}`, objectRef: `${USER_URN_PREFIX}${userId}`, use: CLAIMANT_USE }
}

// ─── Build ───────────────────────────────────────────────────────────────────

export interface MwdBuildOptions {
  submodelId: string
  node: FlowNodeDef
  /** Version of the workflow (machine head or frozen version label). */
  version?: string | null
  /** Machine updatedAt / iteration createdAt; omitted from the MWD when unknown. */
  publishedAt?: Date | string | null
  definitionType: 'pattern' | 'instance'
  /** Appended to the PersonnelSpecifications (e.g. the claimant at Instance level). */
  extraPersonnel?: WorkResourceSpec[]
}

export function buildMwdSubmodel(o: MwdBuildOptions) {
  const node = o.node
  const work = normalizeWorkDescription(node.work ?? {})
  const partnerIds = node.responsiblePartnerIds ?? []
  const elements: object[] = []

  elements.push(prop('ID', mwdSem('ID'), node.id))
  if (o.version) elements.push(prop('Version', mwdSem('Version'), o.version))
  elements.push(mlp('Description', mwdSem('Description'), node.description || node.name))
  const scope = work.hierarchyScope ?? partnerIds[0]
  if (scope) elements.push(prop('HierarchyScope', mwdSem('HierarchyScope'), scope))
  elements.push(prop('WorkType', mwdSem('WorkType'), work.workType ?? 'production'))
  if (work.duration) elements.push(prop('Duration', mwdSem('Duration'), work.duration))
  if (work.durationUnit) elements.push(prop('DurationUnit', mwdSem('DurationUnit'), work.durationUnit))
  const published = toXsDateTime(o.publishedAt)
  if (published) elements.push(prop('PublishedDate', mwdSem('PublishedDate'), published, 'xs:dateTime'))
  elements.push(prop('DefinitionType', mwdSem('DefinitionType'), o.definitionType))

  const parameters = (work.parameters ?? []).map(parameterItem)
  if (parameters.length > 0) {
    elements.push(sml('ParameterSpecifications', mwdSem('ParameterSpecifications'),
      mwdSem('ParameterSpecifications', MWD_LISTS.ParameterSpecifications.item), parameters))
  }

  // Derivation rule: without authored personnel, every responsible partner
  // becomes one PersonnelSpecification (class = partner URN).
  const authored = work.personnel ?? []
  const personnel = [...(authored.length > 0 ? authored : partnerIds.map(partnerPersonnel)), ...(o.extraPersonnel ?? [])]
  const resources: Record<MwdResourceListId, WorkResourceSpec[]> = {
    PersonnelSpecifications: personnel,
    EquipmentSpecifications: work.equipment ?? [],
    PhysicalAssetSpecifications: work.physicalAssets ?? [],
    MaterialSpecifications: work.materials ?? [],
  }
  for (const listId of RESOURCE_LIST_IDS) {
    const items = resources[listId].map((r) => resourceItem(listId, r))
    if (items.length === 0) continue // empty lists are omitted entirely
    elements.push(sml(listId, mwdSem(listId), mwdSem(listId, MWD_LISTS[listId].item), items))
  }

  return {
    modelType: 'Submodel',
    id: o.submodelId,
    idShort: mwdIdShort(node.id),
    kind: 'Instance',
    semanticId: extRef(MWD_ROOT),
    administration: { templateId: MWD_TEMPLATE_ID },
    description: en(`Manufacturing Work Description (${o.definitionType}) of workflow step "${node.name}"`),
    submodelElements: elements,
  }
}

function parameterItem(p: WorkParameterSpec) {
  const L = (...x: string[]) => mwdSem('ParameterSpecifications', MWD_LISTS.ParameterSpecifications.item, ...x)
  return smc(null, L(), [
    prop('ID', L('ID'), p.id),
    ...(p.description ? [mlp('Description', L('Description'), p.description)] : []),
    prop('Value', L('Value'), p.value),
    prop('ValueUnit', L('ValueUnit'), p.valueUnit), // cardinality One: element kept, value optional
  ])
}

function resourceItem(listId: MwdResourceListId, r: WorkResourceSpec) {
  const meta = MWD_RESOURCE_LISTS[listId]
  const L = (...x: string[]) => mwdSem(listId, MWD_LISTS[listId].item, ...x)
  const children: object[] = [
    refEl(`${meta.name}Class`, L(`${meta.name}Class`), r.classRef ? extRef(r.classRef) : undefined),
    refEl(meta.object, L(meta.object), r.objectRef ? extRef(r.objectRef) : undefined),
    ...(r.description ? [mlp('Description', L('Description'), r.description)] : []),
    ...(r.use ? [prop(`${meta.name}Use`, L(`${meta.name}Use`), r.use)] : []),
    prop('Quantity', L('Quantity'), r.quantity), // cardinality One
    prop('QuantityUnit', L('QuantityUnit'), r.quantityUnit), // cardinality One
  ]
  if (listId === 'MaterialSpecifications') {
    if (r.assemblyType) children.push(prop('AssemblyType', L('AssemblyType'), r.assemblyType))
    if (r.assemblyRelationship) children.push(prop('AssemblyRelationship', L('AssemblyRelationship'), r.assemblyRelationship))
  }
  const base = `${meta.name}SpecificationProperty`
  const P = (...x: string[]) => L(base, ...x)
  ;(r.properties ?? []).forEach((p, i) => {
    // Several *SpecificationProperty collections in one SMC need distinct
    // idShorts (AASd-022): first one bare, then a two-digit suffix.
    const idShort = i === 0 ? base : `${base}${String(i).padStart(2, '0')}`
    children.push(smc(idShort, P(), [
      prop('ID', P('ID'), p.id),
      ...(p.description ? [mlp('Description', P('Description'), p.description)] : []),
      prop('Value', P('Value'), p.value),
      ...(p.valueUnit ? [prop('ValueUnit', P('ValueUnit'), p.valueUnit)] : []),
      ...(p.quantity ? [prop('Quantity', P('Quantity'), p.quantity)] : []),
      ...(p.quantityUnit ? [prop('QuantityUnit', P('QuantityUnit'), p.quantityUnit)] : []),
    ]))
  })
  return smc(null, L(), children)
}

// ─── Read (inverse) ──────────────────────────────────────────────────────────

export function isMwdSubmodel(sm: any): boolean {
  if (!sm || typeof sm !== 'object') return false
  if (semanticIdOf(sm) === MWD_ROOT) return true
  if (sm.administration?.templateId === MWD_TEMPLATE_ID) return true
  const idShort = String(sm.idShort ?? '')
  return /^MWD_/.test(idShort) || /ManufacturingWorkDescription/i.test(idShort)
}

/** Value of the mandatory `ID` property, or undefined. */
export function mwdIdValue(sm: any): string | undefined {
  return propValue(sm, 'ID')
}

export interface MwdReadResult {
  id?: string
  version?: string
  description?: string
  definitionType?: string
  /** Normalised work description without the derived (partner / claimant) personnel. */
  work: WorkDescriptionDef
  /** Partner ids recovered from derived PersonnelSpecifications (PersonnelUse 'responsible partner'). */
  responsiblePartnerIds: string[]
}

/**
 * Read an MWD submodel. Tolerant of the UCB v3 AASX variants: lists may be
 * SMCs instead of SMLs, list idShorts may be singular, items may carry an
 * idShort, 'Assembly Relationship' may contain a space, semanticIds may be
 * missing. Resource local ids are not part of the MWD and are regenerated as
 * `<kind>-<n>`.
 */
export function readMwd(sm: any): MwdReadResult {
  const responsiblePartnerIds: string[] = []

  const parameters: WorkParameterSpec[] = listItems(sm, 'ParameterSpecifications').map((item, i) => ({
    id: propValue(item, 'ID') ?? `param-${i + 1}`,
    description: propValue(item, 'Description'),
    value: propValue(item, 'Value') ?? '',
    valueUnit: propValue(item, 'ValueUnit'),
  }))

  const resources: Partial<Record<MwdResourceListId, WorkResourceSpec[]>> = {}
  for (const listId of RESOURCE_LIST_IDS) {
    const meta = MWD_RESOURCE_LISTS[listId]
    const kept: Omit<WorkResourceSpec, 'id'>[] = []
    for (const item of listItems(sm, listId)) {
      const classRef = refTarget(item, `${meta.name}Class`)
      const objectRef = refTarget(item, meta.object)
      const use = propValue(item, `${meta.name}Use`)
      if (listId === 'PersonnelSpecifications') {
        // Derived entries never become authored personnel (round-trip stays clean).
        if (use === RESPONSIBLE_PARTNER_USE && classRef?.startsWith(PARTNER_URN_PREFIX)) {
          const partnerId = classRef.slice(PARTNER_URN_PREFIX.length)
          if (partnerId && !responsiblePartnerIds.includes(partnerId)) responsiblePartnerIds.push(partnerId)
          continue
        }
        if (use === CLAIMANT_USE && objectRef?.startsWith(USER_URN_PREFIX)) continue
      }
      const entry: Omit<WorkResourceSpec, 'id'> = {
        classRef,
        objectRef,
        description: propValue(item, 'Description'),
        use,
        quantity: propValue(item, 'Quantity'),
        quantityUnit: propValue(item, 'QuantityUnit'),
        properties: specProperties(item, meta.name, mwdSem(listId, MWD_LISTS[listId].item, `${meta.name}SpecificationProperty`)),
      }
      if (listId === 'MaterialSpecifications') {
        entry.assemblyType = propValue(item, 'AssemblyType')?.toLowerCase() as WorkResourceSpec['assemblyType']
        entry.assemblyRelationship = propValue(item, 'AssemblyRelationship')?.toLowerCase() as WorkResourceSpec['assemblyRelationship']
      }
      kept.push(entry)
    }
    resources[listId] = kept.map((e, i) => ({ id: `${RESOURCE_ID_PREFIX[listId]}-${i + 1}`, ...e }))
  }

  const work = normalizeWorkDescription({
    hierarchyScope: propValue(sm, 'HierarchyScope'),
    workType: propValue(sm, 'WorkType')?.toLowerCase(),
    duration: propValue(sm, 'Duration'),
    durationUnit: propValue(sm, 'DurationUnit'),
    parameters,
    personnel: resources.PersonnelSpecifications,
    equipment: resources.EquipmentSpecifications,
    physicalAssets: resources.PhysicalAssetSpecifications,
    materials: resources.MaterialSpecifications,
  })

  return {
    id: mwdIdValue(sm),
    version: propValue(sm, 'Version'),
    description: propValue(sm, 'Description'),
    definitionType: propValue(sm, 'DefinitionType'),
    work,
    responsiblePartnerIds,
  }
}

/**
 * `work` to store on an imported node. The exporter's defaults are stripped
 * symmetrically, so a node exported without `work` imports back without `work`:
 *   - HierarchyScope equal to the primary responsible partner id,
 *   - WorkType 'production' when no other work field is authored,
 *   - the derived partner / claimant PersonnelSpecifications (dropped by readMwd).
 * Version (machine version) and Description (node description or name) are MWD
 * root metadata, never part of `work`, so there is nothing to strip for them.
 * Single remaining ambiguity: an authored `{ workType: 'production' }` with no
 * other field exports exactly like "no work" and therefore imports as no work;
 * 'production' survives the round trip only next to another work field.
 */
export function toNodeWork(read: MwdReadResult, primaryPartnerId?: string): WorkDescriptionDef | undefined {
  const w: WorkDescriptionDef = { ...read.work }
  if (w.hierarchyScope && primaryPartnerId && w.hierarchyScope === primaryPartnerId) w.hierarchyScope = undefined
  const hasList = [w.parameters, w.personnel, w.equipment, w.physicalAssets, w.materials].some((l) => (l?.length ?? 0) > 0)
  const hasOther = hasList || !!(w.hierarchyScope || w.duration || w.durationUnit)
  if (w.workType === 'production' && !hasOther) w.workType = undefined
  return hasOther || w.workType ? w : undefined
}

function listItems(sm: any, listId: keyof typeof MWD_LISTS): any[] {
  const bySem = findBySemanticId(sm, mwdSem(listId))[0]
  const container = bySem ?? findElement(sm, listId) ?? findElement(sm, MWD_LISTS[listId].item)
  return elementsOf(container).filter((e) => e?.modelType === 'SubmodelElementCollection')
}

function specProperties(item: any, name: string, iri: string): WorkSpecProperty[] {
  const prefix = idShortKey(`${name}SpecificationProperty`)
  const smcs = elementsOf(item).filter((e) =>
    e?.modelType === 'SubmodelElementCollection' &&
    (semanticIdOf(e) === iri || idShortKey(e.idShort).startsWith(prefix)),
  )
  return smcs.map((e, i) => ({
    id: propValue(e, 'ID') ?? `prop-${i + 1}`,
    description: propValue(e, 'Description'),
    value: propValue(e, 'Value') ?? '',
    valueUnit: propValue(e, 'ValueUnit'),
    quantity: propValue(e, 'Quantity'),
    quantityUnit: propValue(e, 'QuantityUnit'),
  }))
}
