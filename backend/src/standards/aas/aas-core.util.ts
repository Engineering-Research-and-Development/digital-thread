/**
 * Small builders and readers for AAS V3 (metamodel 3.0) JSON, shared by the
 * Type-level export (AasMapperService), the Instance-level export
 * (AasSubmodelsService) and the importer. Mirrors the conventions of the
 * Python prototype in docs/idta-02100/tools/aaslib.py so the output stays
 * identical to what the official aas-core3 verifier accepted:
 *
 *   - every element carries a `semanticId` (ExternalReference / GlobalReference)
 *   - empty values are omitted, never emitted as '' (an empty xs:dateTime is invalid)
 *   - SubmodelElementList items carry NO idShort (constraint AASd-120)
 *   - ConceptDescriptions use the IEC 61360 data specification
 */

export const IEC61360_DATA_SPEC = 'https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360/3/0'

export type AasValueType = 'xs:string' | 'xs:boolean' | 'xs:dateTime' | 'xs:double' | 'xs:float'

export interface AasReference {
  type: 'ExternalReference' | 'ModelReference'
  keys: Array<{ type: string; value: string }>
}

export interface ConceptDefinition {
  idShort: string
  definition: string
  /** IEC 61360 data type; defaults to STRING. */
  dataType?: 'STRING' | 'DATE' | 'BOOLEAN' | 'REAL_MEASURE'
}

// ─── Builders ────────────────────────────────────────────────────────────────

export function extRef(iri: string): AasReference {
  return { type: 'ExternalReference', keys: [{ type: 'GlobalReference', value: iri }] }
}

export function modelRef(...keys: Array<[type: string, value: string]>): AasReference {
  return { type: 'ModelReference', keys: keys.map(([type, value]) => ({ type, value })) }
}

export function en(text: string) {
  return [{ language: 'en', text }]
}

function hasValue(v: unknown): v is string | number | boolean {
  return v !== undefined && v !== null && v !== ''
}

/** Property; `value` is omitted when empty so no element ever carries ''. */
export function prop(idShort: string, semanticId: string, value?: unknown, valueType: AasValueType = 'xs:string') {
  return {
    modelType: 'Property',
    idShort,
    semanticId: extRef(semanticId),
    valueType,
    ...(hasValue(value) ? { value: String(value) } : {}),
  }
}

/** MultiLanguageProperty with a single English entry (omitted when empty). */
export function mlp(idShort: string, semanticId: string, text?: string | null) {
  return {
    modelType: 'MultiLanguageProperty',
    idShort,
    semanticId: extRef(semanticId),
    ...(hasValue(text) ? { value: en(String(text)) } : {}),
  }
}

/** SubmodelElementCollection. Pass `idShort: null` for list items (AASd-120). */
export function smc(idShort: string | null, semanticId: string, children: object[], description?: string) {
  return {
    modelType: 'SubmodelElementCollection',
    ...(idShort ? { idShort } : {}),
    semanticId: extRef(semanticId),
    ...(description ? { description: en(description) } : {}),
    ...(children.length > 0 ? { value: children } : {}),
  }
}

/** SubmodelElementList of SubmodelElementCollections sharing `itemSemanticId`. */
export function sml(idShort: string, semanticId: string, itemSemanticId: string, children: object[]) {
  return {
    modelType: 'SubmodelElementList',
    idShort,
    semanticId: extRef(semanticId),
    orderRelevant: false,
    semanticIdListElement: extRef(itemSemanticId),
    typeValueListElement: 'SubmodelElementCollection',
    ...(children.length > 0 ? { value: children } : {}),
  }
}

/** ReferenceElement; `value` omitted when the target is unknown. */
export function refEl(idShort: string, semanticId: string, target?: AasReference | null) {
  return {
    modelType: 'ReferenceElement',
    idShort,
    semanticId: extRef(semanticId),
    ...(target ? { value: target } : {}),
  }
}

export function conceptDescription(iri: string, def: ConceptDefinition) {
  return {
    modelType: 'ConceptDescription',
    id: iri,
    idShort: sanitizeIdShort(def.idShort, 'Concept'),
    embeddedDataSpecifications: [
      {
        dataSpecification: extRef(IEC61360_DATA_SPEC),
        dataSpecificationContent: {
          modelType: 'DataSpecificationIec61360',
          preferredName: en(def.idShort),
          definition: en(def.definition),
          dataType: def.dataType ?? 'STRING',
        },
      },
    ],
  }
}

/**
 * AASd-002: idShort is letters, digits and underscore, starts with a letter,
 * max 128 characters. `fallback` is prefixed when the sanitised value is empty
 * or does not start with a letter.
 */
export function sanitizeIdShort(raw: unknown, fallback = 'Id'): string {
  const s = String(raw ?? '').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  const withPrefix = /^[A-Za-z]/.test(s) ? s : `${fallback}_${s}`.replace(/_+$/g, '')
  return withPrefix.slice(0, 128)
}

/** xs:dateTime from a Date or ISO string; undefined when unknown or invalid. */
export function toXsDateTime(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

// ─── Readers (tolerant: idShorts compared without case/spaces/underscores) ───

/** Comparison key for idShorts: case, spaces and underscores are ignored. */
export function idShortKey(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const normKey = idShortKey

/** Children of a Submodel / SMC / SML / AnnotatedRelationshipElement. */
export function elementsOf(container: any): any[] {
  if (!container || typeof container !== 'object') return []
  if (Array.isArray(container.submodelElements)) return container.submodelElements
  if (Array.isArray(container.value)) return container.value
  return []
}

export function findElement(container: any, idShort: string, modelType?: string): any | undefined {
  const want = normKey(idShort)
  return elementsOf(container).find(
    (e) => e && normKey(e.idShort) === want && (!modelType || e.modelType === modelType),
  )
}

export function findBySemanticId(container: any, iri: string): any[] {
  return elementsOf(container).filter((e) => semanticIdOf(e) === iri)
}

/** Property value (string) or undefined when absent/empty. */
export function propValue(container: any, idShort: string): string | undefined {
  const el = findElement(container, idShort)
  if (!el) return undefined
  if (el.modelType === 'MultiLanguageProperty') return mlpText(container, idShort)
  const v = el.value
  if (v === undefined || v === null) return undefined
  if (typeof v === 'object') return undefined
  const s = String(v)
  return s === '' ? undefined : s
}

/** Text of a MultiLanguageProperty (preferred language first, else the first entry). */
export function mlpText(container: any, idShort: string, lang = 'en'): string | undefined {
  const el = findElement(container, idShort)
  if (!el) return undefined
  if (typeof el.value === 'string') return el.value || undefined
  if (!Array.isArray(el.value)) return undefined
  const hit = el.value.find((x: any) => x?.language === lang) ?? el.value[0]
  const text = hit?.text
  return typeof text === 'string' && text !== '' ? text : undefined
}

/** Last key value of a ReferenceElement's target reference, or undefined. */
export function refTarget(container: any, idShort: string): string | undefined {
  const el = findElement(container, idShort)
  return lastKeyValue(el?.value)
}

export function lastKeyValue(ref: any): string | undefined {
  const keys = ref?.keys
  if (!Array.isArray(keys) || keys.length === 0) return undefined
  const v = keys[keys.length - 1]?.value
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** Value of the first key of `semanticId` (the global IRI), or undefined. */
export function semanticIdOf(el: any): string | undefined {
  const keys = el?.semanticId?.keys
  if (!Array.isArray(keys) || keys.length === 0) return undefined
  const v = keys[0]?.value
  return typeof v === 'string' ? v : undefined
}

// ─── ConceptDescriptions ─────────────────────────────────────────────────────

/** Every IRI used as `semanticId` / `semanticIdListElement` anywhere below `root`. */
export function collectSemanticIds(root: unknown, into = new Set<string>()): Set<string> {
  if (!root || typeof root !== 'object') return into
  if (Array.isArray(root)) {
    root.forEach((x) => collectSemanticIds(x, into))
    return into
  }
  const obj = root as Record<string, unknown>
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'semanticId' || k === 'semanticIdListElement') {
      const iri = semanticIdOf({ semanticId: v })
      if (iri) into.add(iri)
    } else if (v && typeof v === 'object') {
      collectSemanticIds(v, into)
    }
  }
  return into
}

/**
 * One ConceptDescription per distinct semanticId used in `submodels` for which
 * a definition is known, sorted by id. IRIs without a definition (ECLASS IRDIs,
 * foreign templates) are left to their owners.
 */
export function conceptDescriptionsFor(submodels: unknown, definitions: Record<string, ConceptDefinition>) {
  return [...collectSemanticIds(submodels)]
    .filter((iri) => definitions[iri])
    .sort()
    .map((iri) => conceptDescription(iri, definitions[iri]))
}
