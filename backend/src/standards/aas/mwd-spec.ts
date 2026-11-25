/**
 * Structure of the IDTA 02100 "Manufacturing Work Description" submodel
 * (based on ISA-95 Work Master) as specified in the UCB document v1.0 of
 * 27.01.2026. Single source of truth for idShorts, semanticIds, cardinalities
 * and ConceptDescription definitions; port of docs/idta-02100/tools/mwd_spec.py.
 * Cardinalities are the document's own; deliberate deviations are listed in
 * MWD_DEVIATIONS (also docs/idta-02100/out/template/TEMPLATE-NOTES.md).
 */

import type { ConceptDefinition } from './aas-core.util'

export const MWD_ROOT = 'https://admin-shell.io/idta/ManufacturingWorkDescription/1/0'
export const MWD_TEMPLATE_ID = 'https://admin-shell.io/idta/SubmodelTemplate/ManufacturingWorkDescription/1/0'

export type MwdElementKind = 'Prop' | 'MLP' | 'Ref' | 'SMC'
export type MwdCardinality = 'One' | 'ZeroToOne' | 'ZeroToMany' | 'OneToMany'

export interface MwdRow {
  idShort: string
  kind: MwdElementKind
  valueType: 'string' | 'dateTime' | null
  cardinality: MwdCardinality
  definition: string
}

const row = (
  idShort: string,
  kind: MwdElementKind,
  valueType: MwdRow['valueType'],
  cardinality: MwdCardinality,
  definition: string,
): MwdRow => ({ idShort, kind, valueType, cardinality, definition })

export const MWD_ROOT_DEFINITION =
  'Description of the manufacturing process regarding its personnel, equipment, physical asset and material capabilities'

export const MWD_ROOT_PROPS: MwdRow[] = [
  row('ID', 'Prop', 'string', 'One', 'A unique identification as the Manufacturing Work Description ID'),
  row('Version', 'Prop', 'string', 'ZeroToOne', 'An identification of the version of the Manufacturing Work Description'),
  row('Description', 'MLP', null, 'ZeroToOne',
    'Contains additional information and descriptions of the Manufacturing Work Description'),
  row('HierarchyScope', 'Prop', 'string', 'ZeroToOne',
    'Identifies where the exchanged information fits within the role-based equipment hierarchy'),
  row('WorkType', 'Prop', 'string', 'ZeroToOne',
    'Describes the category of work. Can be defined as production, maintenance, quality, inventory or mixed'),
  row('Duration', 'Prop', 'string', 'ZeroToOne', 'Duration, if known'),
  row('DurationUnit', 'Prop', 'string', 'ZeroToOne', 'The units of measure of the duration, if defined'),
  row('PublishedDate', 'Prop', 'dateTime', 'ZeroToOne',
    'The date and time on which the Manufacturing Work Description was published or generated'),
  row('DefinitionType', 'Prop', 'string', 'ZeroToOne',
    'Defines the type of the Manufacturing Work Description. Can be defined as pattern or instance'),
]

/** Shared by Personnel/Equipment/PhysicalAsset/Material SpecificationProperty (document section 3.7). */
export const MWD_SPEC_PROPERTY: MwdRow[] = [
  row('ID', 'Prop', 'string', 'One',
    'A unique identification of a property of the associated class property or object property'),
  row('Description', 'MLP', null, 'ZeroToOne', 'Contains additional information and descriptions of the specification'),
  row('Value', 'Prop', 'string', 'One', 'The value, set of values, or range of the property'),
  row('ValueUnit', 'Prop', 'string', 'ZeroToOne', 'The unit of measure of the associated property value'),
  row('Quantity', 'Prop', 'string', 'ZeroToOne', 'Specifies the amount of resources required'),
  row('QuantityUnit', 'Prop', 'string', 'ZeroToOne', 'The unit of measure of the associated quantity'),
]

const DESCRIPTION_ROW = row('Description', 'MLP', null, 'ZeroToOne',
  'Contains additional information and descriptions of the specification')

export type MwdListId =
  | 'ParameterSpecifications'
  | 'PersonnelSpecifications'
  | 'EquipmentSpecifications'
  | 'PhysicalAssetSpecifications'
  | 'MaterialSpecifications'

export type MwdResourceListId = Exclude<MwdListId, 'ParameterSpecifications'>

export interface MwdListSpec {
  /** idShort of the SMC items (and semanticId segment). */
  item: string
  listDefinition: string
  itemDefinition: string
  rows: MwdRow[]
}

function resourceRows(name: string, obj: string, clsDef: string, objDef: string, useDef: string, extra: MwdRow[] = []): MwdRow[] {
  const low = name === 'PhysicalAsset' ? 'physical asset' : name.toLowerCase()
  return [
    row(`${name}Class`, 'Ref', null, 'One', clsDef),
    row(obj, 'Ref', null, 'One', objDef),
    DESCRIPTION_ROW,
    row(`${name}Use`, 'Prop', 'string', 'ZeroToOne', useDef),
    row('Quantity', 'Prop', 'string', 'One', `Specifies the amount of ${low} resources required, if applicable`),
    row('QuantityUnit', 'Prop', 'string', 'One', 'The unit of measure of the associated quantity, if applicable'),
    ...extra,
    row(`${name}SpecificationProperty`, 'SMC', null, 'ZeroToMany',
      `Defines attributes for a ${low} specification property object`),
  ]
}

export const MWD_LISTS: Record<MwdListId, MwdListSpec> = {
  ParameterSpecifications: {
    item: 'ParameterSpecification',
    listDefinition: 'List of parameter specifications related to this Manufacturing Work Description',
    itemDefinition:
      'Names and data types of values used to parameterize Level 3 system operations of the Manufacturing Work Description',
    rows: [
      row('ID', 'Prop', 'string', 'One', 'Identification of the parameter for a specific segment'),
      DESCRIPTION_ROW,
      row('Value', 'Prop', 'string', 'One', 'The value, set of values, or range of acceptable values'),
      row('ValueUnit', 'Prop', 'string', 'One', 'Unit of measure of the values, if applicable'),
    ],
  },
  PersonnelSpecifications: {
    item: 'PersonnelSpecification',
    listDefinition: 'List of personnel specifications related to this Manufacturing Work Description',
    itemDefinition: 'Identifies and references a personnel capability of the Manufacturing Work Description',
    rows: resourceRows('Personnel', 'Person',
      'Identifies the associated personnel class or set of personnel classes of the specification',
      'Identifies the associated person or set of persons of the specification',
      'Defines the expected use of the personnel class or person.'),
  },
  EquipmentSpecifications: {
    item: 'EquipmentSpecification',
    listDefinition: 'List of equipment specifications related to this Manufacturing Work Description',
    itemDefinition: 'Identifies and references an equipment capability of the Manufacturing Work Description',
    rows: resourceRows('Equipment', 'Equipment',
      'Identifies the associated equipment class or set of equipment classes of the specification',
      'Identifies the associated equipment or set of equipment of the specification',
      'Defines the expected use of the equipment class or equipment.'),
  },
  PhysicalAssetSpecifications: {
    item: 'PhysicalAssetSpecification',
    listDefinition: 'List of physical asset specifications related to this Manufacturing Work Description',
    itemDefinition: 'Identifies and references a physical asset capability of the Manufacturing Work Description',
    rows: resourceRows('PhysicalAsset', 'PhysicalAsset',
      'Identifies the associated physical asset class or set of physical asset classes of the specification',
      'Identifies the associated physical asset or set of physical assets of the specification',
      'Defines the expected use of the physical asset class or physical asset.'),
  },
  MaterialSpecifications: {
    item: 'MaterialSpecification',
    listDefinition: 'List of material specifications related to this Manufacturing Work Description',
    itemDefinition: 'Identifies and references a material capability of the Manufacturing Work Description',
    rows: resourceRows('Material', 'MaterialDefinition',
      'Identifies the associated material class or set of material classes of the specification',
      'Identifies the associated material or set of material of the specification',
      'Defines the expected use of the material class or material.',
      [
        row('AssemblyType', 'Prop', 'string', 'ZeroToOne',
          'Defines the type of the assembly as physical, if the components of the assembly are physically connected or in the same area, and logical if not'),
        row('AssemblyRelationship', 'Prop', 'string', 'ZeroToOne',
          'Defines the type of the relationships as permanent if the assembly is not intended to be split during the production process, and transient if temporary assembly during production occurs'),
      ]),
  },
}

/** How each resource list maps onto WorkDescriptionDef. */
export const MWD_RESOURCE_LISTS: Record<MwdResourceListId, {
  name: 'Personnel' | 'Equipment' | 'PhysicalAsset' | 'Material'
  object: 'Person' | 'Equipment' | 'PhysicalAsset' | 'MaterialDefinition'
  workKey: 'personnel' | 'equipment' | 'physicalAssets' | 'materials'
}> = {
  PersonnelSpecifications: { name: 'Personnel', object: 'Person', workKey: 'personnel' },
  EquipmentSpecifications: { name: 'Equipment', object: 'Equipment', workKey: 'equipment' },
  PhysicalAssetSpecifications: { name: 'PhysicalAsset', object: 'PhysicalAsset', workKey: 'physicalAssets' },
  MaterialSpecifications: { name: 'Material', object: 'MaterialDefinition', workKey: 'materials' },
}

export const MWD_LIST_IDS = Object.keys(MWD_LISTS) as MwdListId[]

export const MWD_DEVIATIONS = [
  'SML containers carry SMT/Cardinality ZeroToOne and their SMC item ZeroToMany (document: [0..*] on both rows; a list of lists is not meaningful).',
  "Semantic id of PhysicalAssetSpecifications corrected from '.../PhysicalAssetlSpecifications' (typo in document, Table 1).",
  "Semantic id of MaterialDefinition set to '.../MaterialSpecification/MaterialDefinition' (document ends in '/Material', Table 11).",
  "idShort 'AssemblyRelationship' without space (AASX v3 has 'Assembly Relationship', invalid per AASd-002).",
  "idShort 'EquipmentSpecifications' in plural as in the document (AASX v3 has the singular).",
  'Every *SpecificationProperty collection is typed SubmodelElementCollection (Table 12 header says SubmodelElementList).',
  "Items of the SubmodelElementLists carry no idShort (AASd-120); the v3 AASX used '<Name>_00'.",
  "Several *SpecificationProperty collections in one specification get a two-digit suffix ('MaterialSpecificationProperty', 'MaterialSpecificationProperty01', ...) so idShorts stay unique (AASd-022).",
]

/** semanticId IRI of an element: MWD_ROOT + '/' + path segments. */
export function mwdSem(...parts: string[]): string {
  return parts.length ? `${MWD_ROOT}/${parts.join('/')}` : MWD_ROOT
}

function definitionsFromRows(path: string[], rows: MwdRow[], into: Record<string, ConceptDefinition>) {
  for (const r of rows) {
    into[mwdSem(...path, r.idShort)] = {
      idShort: r.idShort,
      definition: r.definition,
      dataType: r.valueType === 'dateTime' ? 'DATE' : 'STRING',
    }
    if (r.kind === 'SMC') definitionsFromRows([...path, r.idShort], MWD_SPEC_PROPERTY, into)
  }
}

/** ConceptDescription definitions for every MWD semanticId, keyed by IRI. */
export const MWD_DEFINITIONS: Record<string, ConceptDefinition> = (() => {
  const out: Record<string, ConceptDefinition> = {
    [MWD_ROOT]: { idShort: 'ManufacturingWorkDescription', definition: MWD_ROOT_DEFINITION },
  }
  definitionsFromRows([], MWD_ROOT_PROPS, out)
  for (const listId of MWD_LIST_IDS) {
    const spec = MWD_LISTS[listId]
    out[mwdSem(listId)] = { idShort: listId, definition: spec.listDefinition }
    out[mwdSem(listId, spec.item)] = { idShort: spec.item, definition: spec.itemDefinition }
    definitionsFromRows([listId, spec.item], spec.rows, out)
  }
  return out
})()
