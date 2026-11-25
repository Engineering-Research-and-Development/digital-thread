# AAS export and import: IDTA 02100 Manufacturing Work Description mapping

**Standard:** IEC 63278 / Asset Administration Shell Part 1 metamodel V3.0, JSON serialisation
**Submodel template:** IDTA 02100 "Manufacturing Work Description" (MWD), draft v1.0 by UCB
(27.01.2026) with the corrections of the ENG draft package (see section 9)
**Companion document:** `backend/docs/aas-minimum-example.md` (served in-app at `/docs/standards/aas`)
holds the minimum importable document and the `WorkflowDefinition` reference. This document is the
contract for the MWD part and for the Environment envelope that carries both.

---

## 1. Purpose

A Digital Thread workflow is a sequence of jobs executed by several organisations. The AAS export
of a workflow (`GET /api/v1/aas/machines/:id`) is a standard AAS 3.0 **Environment** with:

- one `AssetAdministrationShell` (`assetKind: Type`) for the workflow;
- one `WorkflowDefinition` submodel: sequencing, the input/output file contract of every node,
  gateway logic and group membership (ISA-95 Part 4 **Workflow Specification**: nodes and
  connections);
- one **Manufacturing Work Description** submodel per `TASK` node (ISA-95 **Work Master**: what
  the job needs in personnel, equipment, physical assets, material and parameters);
- one `ConceptDescription` per `semanticId` used in the document.

ISA-95 Part 4 pairs the Work Master with the Workflow Specification in exactly this way: the Work
Master describes one job, the Workflow Specification orders the jobs. `TRIGGER` and `GATEWAY`
nodes are not jobs and get no MWD. The iteration shell (`GET /api/v1/aas/iteration/:id/shell`)
uses the same Environment envelope and adds one MWD per `TASK` node of the **frozen**
`StateMachineVersion`, with `DefinitionType` `instance` (section 6).

## 2. Single source of truth

The MWD element table (idShorts, element types, cardinalities, definitions and the deliberate
deviations from the UCB draft) lives in code, in **one** place:

- `backend/src/standards/aas/mwd-spec.ts`: TypeScript port used by the exporter, the importer and
  the validator. It is the authoritative table; this document is derived from it.
- `docs/idta-02100/tools/mwd_spec.py`: the Python original that generated the reference template
  and the sample instances in `docs/idta-02100/out/` (all verified with the official `aas-core3`
  SDK, 0 findings).

When the IDTA working team changes the template, update `mwd-spec.ts` (and `mwd_spec.py` if the
reference package is regenerated), then this document and
`test/standards-roundtrip.e2e-spec.ts` in the same change.

## 3. Identifiers

| Object | Value |
|---|---|
| Workflow shell id | `urn:digitalthread:aas:machine:<machineId>` |
| Workflow asset (`globalAssetId`) | `urn:digitalthread:asset:workflow:<machineId>` |
| `WorkflowDefinition` submodel id | `urn:digitalthread:sm:workflow-def:<machineId>` |
| `WorkflowDefinition` vocabulary (semanticIds) | `urn:digital-thread:submodel:WorkflowDefinition:1:0` and `.../<path>` (Digital Thread owned, stable) |
| MWD submodel id (workflow export) | `urn:digitalthread:sm:mwd:<machineId>:<nodeId>` |
| MWD submodel id (iteration shell) | `urn:digitalthread:sm:mwd:iteration:<iterationId>:<nodeId>` |
| MWD submodel `idShort` / `kind` | `MWD_<nodeId>` (characters outside `[A-Za-z0-9_]` replaced by `_`) / `Instance` |
| MWD root `semanticId` | `https://admin-shell.io/idta/ManufacturingWorkDescription/1/0` (**draft**, section 9) |
| MWD `administration.templateId` | `https://admin-shell.io/idta/SubmodelTemplate/ManufacturingWorkDescription/1/0` (**draft**) |
| MWD element semanticIds | root IRI + `/` + element path, e.g. `.../1/0/PersonnelSpecifications/PersonnelSpecification/PersonnelClass` |
| Derived personnel class of a partner | `urn:digitalthread:partner:<partnerId>` |
| Person of the user who claimed a node (iteration shell only) | `urn:digitalthread:user:<userId>` |

In the tables below `...` stands for `https://admin-shell.io/idta/ManufacturingWorkDescription/1/0`.

## 4. Node to MWD mapping

Source fields are read from the canonical `FlowNodeDef` (`normalizeFlowNode`). `work` is the
optional work-description object on the node (section 4.5), edited in the editor's "Work
description" tab. **Default** is what the exporter emits when the source field is absent or empty;
"omitted" means the element is not emitted at all (never an empty `value`, never an empty
`xs:dateTime`).

### 4.1 Root elements of the submodel

| idShort | AAS element | Cardinality (UCB v1.0) | Source | Default | semanticId |
|---|---|---|---|---|---|
| `ID` | Property `xs:string` | One | `node.id` | always present | `.../ID` |
| `Version` | Property `xs:string` | ZeroToOne | `StateMachine.version` (workflow export); the frozen `StateMachineVersion.versionLabel`, else the workflow version (iteration shell) | omitted if unknown | `.../Version` |
| `Description` | MultiLanguageProperty (`en`) | ZeroToOne | `node.description` | `node.name` (always present) | `.../Description` |
| `HierarchyScope` | Property `xs:string` | ZeroToOne | `work.hierarchyScope` | the primary responsible partner id (`responsiblePartnerIds[0]`); omitted when the node has no partner | `.../HierarchyScope` |
| `WorkType` | Property `xs:string` | ZeroToOne | `work.workType` (`production`, `maintenance`, `quality`, `inventory`, `mixed`) | `production` | `.../WorkType` |
| `Duration` | Property `xs:string` | ZeroToOne | `work.duration` | omitted | `.../Duration` |
| `DurationUnit` | Property `xs:string` | ZeroToOne | `work.durationUnit` | omitted | `.../DurationUnit` |
| `PublishedDate` | Property `xs:dateTime` (UTC, ISO 8601) | ZeroToOne | `StateMachine.updatedAt` (workflow export); `Iteration.createdAt` (iteration shell) | omitted, never empty | `.../PublishedDate` |
| `DefinitionType` | Property `xs:string` | ZeroToOne | constant | `pattern` (workflow export), `instance` (iteration shell) | `.../DefinitionType` |
| `ParameterSpecifications` | SubmodelElementList of SMC | list ZeroToOne, items ZeroToMany | `work.parameters[]` (4.2) | omitted when empty | `.../ParameterSpecifications`; items `.../ParameterSpecifications/ParameterSpecification` |
| `PersonnelSpecifications` | SubmodelElementList of SMC | list ZeroToOne, items ZeroToMany | `work.personnel[]` (4.3) | one derived item per entry of `responsiblePartnerIds` (4.6) | `.../PersonnelSpecifications`; items `.../PersonnelSpecifications/PersonnelSpecification` |
| `EquipmentSpecifications` | SubmodelElementList of SMC | list ZeroToOne, items ZeroToMany | `work.equipment[]` (4.3) | omitted when empty | `.../EquipmentSpecifications`; items `.../EquipmentSpecifications/EquipmentSpecification` |
| `PhysicalAssetSpecifications` | SubmodelElementList of SMC | list ZeroToOne, items ZeroToMany | `work.physicalAssets[]` (4.3) | omitted when empty | `.../PhysicalAssetSpecifications`; items `.../PhysicalAssetSpecifications/PhysicalAssetSpecification` |
| `MaterialSpecifications` | SubmodelElementList of SMC | list ZeroToOne, items ZeroToMany | `work.materials[]` (4.3) | omitted when empty | `.../MaterialSpecifications`; items `.../MaterialSpecifications/MaterialSpecification` |

Every list is `typeValueListElement: SubmodelElementCollection`, `orderRelevant: false`, with
`semanticIdListElement` set to the item semanticId. List items carry **no** `idShort`
(constraint AASd-120).

### 4.2 Parameter specification (item of `ParameterSpecifications`)

semanticId prefix: `.../ParameterSpecifications/ParameterSpecification/`

| idShort | AAS element | Cardinality | Source (`work.parameters[i]`) | Default |
|---|---|---|---|---|
| `ID` | Property `xs:string` | One | `id` | mandatory; entries without a non-empty string `id` are dropped by `normalizeWorkDescription` |
| `Description` | MultiLanguageProperty | ZeroToOne | `description` | omitted |
| `Value` | Property `xs:string` | One | `value` | mandatory |
| `ValueUnit` | Property `xs:string` | One ("if applicable" in the draft, review finding B3) | `valueUnit` | element always present (cardinality One), `value` omitted when empty |

### 4.3 Resource specifications (items of the four resource lists)

The four lists share one structure. `<R>` and `<O>` are:

| List | Item (`<R>Specification`) | Class reference (`<R>Class`) | Object reference (`<O>`) | Use (`<R>Use`) | Source list |
|---|---|---|---|---|---|
| `PersonnelSpecifications` | `PersonnelSpecification` | `PersonnelClass` | `Person` | `PersonnelUse` | `work.personnel[]` |
| `EquipmentSpecifications` | `EquipmentSpecification` | `EquipmentClass` | `Equipment` | `EquipmentUse` | `work.equipment[]` |
| `PhysicalAssetSpecifications` | `PhysicalAssetSpecification` | `PhysicalAssetClass` | `PhysicalAsset` | `PhysicalAssetUse` | `work.physicalAssets[]` |
| `MaterialSpecifications` | `MaterialSpecification` | `MaterialClass` | `MaterialDefinition` | `MaterialUse` | `work.materials[]` |

semanticId prefix: `.../<List>/<R>Specification/`

| idShort | AAS element | Cardinality | Source (resource entry) | Default |
|---|---|---|---|---|
| `<R>Class` | ReferenceElement, `value` = ExternalReference / GlobalReference to the given IRI or URN | One | `classRef` | emitted without `value` when empty (the draft says One for both references; review finding B1 asks for "at least one of the two") |
| `<O>` | ReferenceElement, same shape | One | `objectRef` | emitted without `value` when empty |
| `Description` | MultiLanguageProperty | ZeroToOne | `description` | omitted |
| `<R>Use` | Property `xs:string` | ZeroToOne | `use` | omitted |
| `Quantity` | Property `xs:string` | One ("if applicable", finding B2) | `quantity` | element always present (cardinality One), `value` omitted when empty |
| `QuantityUnit` | Property `xs:string` | One ("if applicable", finding B2) | `quantityUnit` | element always present (cardinality One), `value` omitted when empty |
| `AssemblyType` | Property `xs:string` (`physical`, `logical`) | ZeroToOne | `assemblyType`, **materials only** | omitted |
| `AssemblyRelationship` | Property `xs:string` (`permanent`, `transient`) | ZeroToOne | `assemblyRelationship`, **materials only** | omitted |
| `<R>SpecificationProperty` | SubmodelElementCollection (4.4) | ZeroToMany | `properties[]` | omitted when empty |

### 4.4 Specification property (nested `properties[]` of a resource entry)

One `SubmodelElementCollection` per entry. The draft types this collection as `[0..*]` with a
fixed idShort; because idShorts must be unique inside their parent (AASd-022), a single entry is
emitted as `<R>SpecificationProperty`; from the second entry on a two-digit index is appended:
`<R>SpecificationProperty01`, `<R>SpecificationProperty02`, ... The importer accepts both the
bare and the suffixed form (and matches by semanticId when present).

semanticId prefix: `.../<List>/<R>Specification/<R>SpecificationProperty/`

| idShort | AAS element | Cardinality | Source (`properties[i]`) | Default |
|---|---|---|---|---|
| `ID` | Property `xs:string` | One | `id` | mandatory; entries without a non-empty string `id` are dropped by `normalizeWorkDescription` |
| `Description` | MultiLanguageProperty | ZeroToOne | `description` | omitted |
| `Value` | Property `xs:string` | One | `value` | mandatory |
| `ValueUnit` | Property `xs:string` | ZeroToOne | `valueUnit` | omitted |
| `Quantity` | Property `xs:string` | ZeroToOne | `quantity` | omitted |
| `QuantityUnit` | Property `xs:string` | ZeroToOne | `quantityUnit` | omitted |

### 4.5 The `work` field on a node

Shape of the optional `work` object (`FlowNodeDef.work`, type `WorkDescriptionDef` in
`backend/src/iterations/types/flow-node.ts`, mirrored in `frontend/src/types/state-machine.ts`).
All values are strings because the draft types every quantity as `xs:string` (finding B11).
Stored `work` is always read through `normalizeWorkDescription` (`normalize-node.ts`), which
drops unknown work types and malformed entries and makes every list an array.

```ts
type WorkType = 'production' | 'maintenance' | 'quality' | 'inventory' | 'mixed'

interface WorkDescriptionDef {
  hierarchyScope?: string
  workType?: WorkType
  duration?: string
  durationUnit?: string
  parameters?: WorkParameterSpec[]
  personnel?: WorkResourceSpec[]
  equipment?: WorkResourceSpec[]
  physicalAssets?: WorkResourceSpec[]
  materials?: WorkResourceSpec[]
}

interface WorkParameterSpec { id: string; description?: string; value: string; valueUnit?: string }

interface WorkResourceSpec {
  id: string                                        // local UI handle, unique in its list; not part of the MWD
  classRef?: string                                 // IRI/URN of the class (PersonnelClass, EquipmentClass, ...)
  objectRef?: string                                // IRI/URN of the object (Person, Equipment, PhysicalAsset, MaterialDefinition)
  description?: string
  use?: string                                      // PersonnelUse / EquipmentUse / PhysicalAssetUse / MaterialUse
  quantity?: string
  quantityUnit?: string
  assemblyType?: 'physical' | 'logical'             // materials only
  assemblyRelationship?: 'permanent' | 'transient'  // materials only
  properties?: WorkSpecProperty[]
}

interface WorkSpecProperty {
  id: string; description?: string; value: string; valueUnit?: string; quantity?: string; quantityUnit?: string
}
```

### 4.6 Defaults, omissions and the derived personnel entries

- Defaults apply **per field**: `work` absent and `work` present with the field empty behave the
  same.
- `ID`, `Version`, `Description`, `PublishedDate` and `DefinitionType` never come from `work`;
  they are derived from the node, the workflow and the export kind on every export.
- When `work.personnel` is empty, the exporter derives one `PersonnelSpecification` per partner in
  `responsiblePartnerIds`: `PersonnelClass` = ExternalReference to
  `urn:digitalthread:partner:<partnerId>`, `Person` without value, `PersonnelUse` =
  `responsible partner`. The iteration shell appends one more entry for the user who claimed the
  node (`Person` = `urn:digitalthread:user:<userId>`, `PersonnelUse` = `claimant`), and only when
  the claimant is recorded as a bare user id: an e-mail address is never exported.
- The importer recognises both derived forms by URN prefix and use value and **does not** turn
  them into `work.personnel`. Partner entries are turned back into `responsiblePartnerIds` when
  the node has none (shape (c), or a `WorkflowDefinition` node without partners); claimant entries
  are dropped. Both are recomputed on the next export.
- The importer also strips a `HierarchyScope` equal to the primary partner id (the exporter
  default). `WorkType` is kept as read, so a node exported without `work` comes back with
  `work = { workType: 'production' }` and empty lists; an MWD with no scalar and no list entry
  yields no `work` at all.
- Resource entries get fresh local ids on import (`personnel-1`, `equipment-1`, ...); the local
  `id` is a UI handle and is not part of the MWD.
- Empty lists are omitted. Optional scalars are omitted. Elements of cardinality One
  (`Quantity`, `QuantityUnit`, `ValueUnit`, the two references of a resource) are always present
  and carry no `value` when unknown. Nothing is emitted as `"value": ""`.
- Reading is tolerant of the UCB v3 AASX variants: lists serialised as SMCs, singular list
  idShorts, list items with an idShort, `Assembly Relationship` with a space, missing
  semanticIds. `WorkType`, `AssemblyType` and `AssemblyRelationship` are lower-cased.
- `HierarchyScope` in ISA-95 refers to the equipment hierarchy; the Digital Thread writes the
  responsible organisation there when the user gave nothing (the draft leaves the string format
  open, finding B10).

## 5. WorkflowDefinition and MWD linkage

In the workflow Environment every `TASK` node SMC of `WorkflowDefinition` carries:

```json
{
  "modelType": "ReferenceElement",
  "idShort": "workDescription",
  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:digital-thread:submodel:WorkflowDefinition:1:0/Node/workDescription" }] },
  "value": { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:digitalthread:sm:mwd:<machineId>:<nodeId>" }] }
}
```

- The shell's `submodels[]` lists a `ModelReference` to `WorkflowDefinition` and to every MWD.
- The MWD's `ID` property equals the node's `nodeId`, so the link also survives tools that drop
  `ReferenceElement`s.
- `TRIGGER` and `GATEWAY` nodes have no `workDescription` and no MWD.
- A file hand-over between two jobs is modelled once, in `WorkflowDefinition` (`inputs[*].source`
  and `sourceRef`), not in the MWD: the Work Master has no element for information exchanged
  between jobs (open point raised with the working team, see `docs/idta-02100/out/MAPPING-NOTE.md`).
- A document that contains both submodels round-trips `work` (import shape (a), section 7).

## 6. Iteration shell differences

| | Workflow export (`GET /api/v1/aas/machines/:id`) | Iteration shell (`GET /api/v1/aas/iteration/:id/shell`) |
|---|---|---|
| Shell `assetKind` | `Type` | `Instance`, `derivedFrom` points to the workflow shell |
| Nodes read from | editable head (`StateMachine.nodesJson`) | the **frozen** `StateMachineVersion` the iteration pins, never the head (iterations created before versioning, with no pinned version, fall back to the head) |
| MWD per | `TASK` node of the head | `TASK` node of the frozen version |
| MWD id | `urn:digitalthread:sm:mwd:<machineId>:<nodeId>` | `urn:digitalthread:sm:mwd:iteration:<iterationId>:<nodeId>` |
| `DefinitionType` | `pattern` | `instance` |
| `Version` | `StateMachine.version` | frozen `versionLabel`, else the workflow version |
| `PublishedDate` | `StateMachine.updatedAt` | `Iteration.createdAt` |
| Extra personnel | none | the user who claimed the node, as a `PersonnelSpecification` with `Person` = `urn:digitalthread:user:<userId>` and `PersonnelUse` = `claimant`; only when the claimant is a bare user id, never an e-mail |
| Other submodels | `WorkflowDefinition` | Digital Nameplate (IDTA 02006, only with an attached Product), `TechnicalData` (IDTA 02003), `HandoverDocumentation` (IDTA 02004), `ProvenanceLog` and `WorkflowExecution` (custom) |
| Link node to MWD | `workDescription` ReferenceElement | MWD `ID` = `WorkflowExecution/NodeStates/Node_<id>/NodeId` |
| Personal data | none | none: no user e-mail address is exported anywhere in the Environment |
| Importable | yes (shape (a)) | no; it is an execution record |

`WorkflowExecution` (per-node status, timestamps, produced files) and `ProvenanceLog` (PROV-O
lineage) stay custom submodels on purpose: the Work Master describes the job, not its execution.
If the working team adds an instance part to IDTA 02100 (as IDTA 02031 did for process
parameters), `WorkflowExecution` is the candidate to align.

## 7. Import shapes

`POST /api/v1/aas/import` (and `POST /api/v1/aas/validate`) accept three shapes. The validator
returns a structured result (`validation.types.ts`) and never throws on a merely invalid document.
The sketches below use `"..."` for elided content; the complete minimal document is in
`aas-minimum-example.md`, section 3.

### (a) Environment with `WorkflowDefinition` and linked MWDs (what the exporter produces)

```json
{
  "assetAdministrationShells": [{ "modelType": "AssetAdministrationShell", "id": "urn:...:aas:machine:M", "idShort": "MyWorkflow",
      "assetInformation": { "assetKind": "Type", "globalAssetId": "urn:...:asset:workflow:M" },
      "submodels": [{ "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:...:sm:workflow-def:M" }] },
                    { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:...:sm:mwd:M:t1" }] }] }],
  "submodels": [
    { "modelType": "Submodel", "idShort": "WorkflowDefinition", "id": "urn:...:sm:workflow-def:M",
      "submodelElements": [ { "modelType": "SubmodelElementCollection", "idShort": "node_t1", "value": [
          { "modelType": "Property", "idShort": "nodeId", "valueType": "xs:string", "value": "t1" },
          { "modelType": "Property", "idShort": "kind",   "valueType": "xs:string", "value": "TASK" },
          { "modelType": "Property", "idShort": "name",   "valueType": "xs:string", "value": "Lay-up" },
          { "modelType": "ReferenceElement", "idShort": "workDescription",
            "value": { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:...:sm:mwd:M:t1" }] } } ] } ] },
    { "modelType": "Submodel", "idShort": "MWD_t1", "id": "urn:...:sm:mwd:M:t1",
      "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0" }] },
      "submodelElements": [ { "modelType": "Property", "idShort": "ID", "valueType": "xs:string", "value": "t1" }, "..." ] }
  ],
  "conceptDescriptions": []
}
```

Result: one workflow; each `TASK` node gets `work` rebuilt from its MWD (the MWD is found through
`workDescription`, else through an MWD whose `ID` equals the `nodeId`); a node exported without
`work` comes back with `work.workType = 'production'` and empty lists (4.6). Derived personnel
entries are not copied into `work`; they restore
`responsiblePartnerIds` when the node SMC has none. MWDs that match no node are ignored. Nodes
without `positionX`/`positionY` are laid out in layers along the edges. The workflow name comes
from `workflowName`, else from the shell `idShort`; the description from the shell.

### (b) Legacy envelope (`submodelInline`)

```json
{
  "modelType": "AssetAdministrationShell",
  "id": "urn:...:aas:my-workflow", "idShort": "MyWorkflow",
  "assetInformation": { "assetKind": "Type", "globalAssetId": "urn:...:asset:my-process" },
  "submodels": [{ "type": "ExternalReference", "keys": [{ "type": "Submodel", "value": "urn:...:sm:wf" }] }],
  "submodelInline": [{ "modelType": "Submodel", "idShort": "WorkflowDefinition", "id": "urn:...:sm:wf",
      "submodelElements": [ { "modelType": "SubmodelElementCollection", "idShort": "node_step1", "value": [ "..." ] },
                            { "modelType": "AnnotatedRelationship", "idShort": "edge_e1", "first": { "...": "..." }, "second": { "...": "..." } } ] }]
}
```

Still accepted, no longer produced. `positionX`/`positionY`, group `color`, the legacy
`nodeCategory`/`nodeTypeId`/`label` properties and the `AnnotatedRelationship` model type are read
as before. No `work` is produced.

### (c) Environment containing only MWD submodels

```json
{
  "submodels": [
    { "modelType": "Submodel", "idShort": "ManufacturingWorkDescription", "id": "urn:example:mwd:atl",
      "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0" }] },
      "submodelElements": [
        { "modelType": "Property", "idShort": "ID", "valueType": "xs:string", "value": "atl-processing" },
        { "modelType": "MultiLanguageProperty", "idShort": "Description", "value": [{ "language": "en", "text": "ATL processing" }] },
        { "modelType": "Property", "idShort": "WorkType", "valueType": "xs:string", "value": "production" } ] }
  ]
}
```

Result: one workflow with **one unconnected `TASK` node per MWD**: `id` = `ID` when it is
route-safe (`[A-Za-z0-9_.:-]+`, made unique with a `-<n>` suffix if repeated), else `mwd-<n>`;
`name` = `Description` (else `ID`); `work` filled from the elements; `responsiblePartnerIds`
recovered from derived partner personnel entries, if any; empty `inputs`/`outputs`, no edges, no
groups, nodes placed on a grid. The user wires the nodes, assigns partners and completes the
file contract in the editor. The workflow name is the shell `idShort` when a shell is present,
else `Imported Manufacturing Work Descriptions`; its version is the first MWD `Version`, else
`1.0.0`. Warning `AAS_MWD_ONLY` is returned.

Detection rules:

- An MWD submodel is recognised by its root `semanticId`; as a fallback by
  `administration.templateId`, or by an `idShort` starting with `MWD_` or containing
  `ManufacturingWorkDescription`.
- The `WorkflowDefinition` submodel is recognised by `idShort` or by its semanticId
  `urn:digital-thread:submodel:WorkflowDefinition:1:0`.
- A document without `assetAdministrationShells` is treated as an Environment only if its
  `submodels[]` entries carry `modelType: "Submodel"`; otherwise `AAS_INVALID_ROOT`.

### Validation codes

| Code | Level | Rule |
|---|---|---|
| `AAS_INVALID_ROOT` | ERROR | Root must be an Environment object (`submodels[]`, optional `assetAdministrationShells[]`) or a legacy shell with `modelType: "AssetAdministrationShell"` |
| `AAS_MISSING_GLOBAL_ASSET_ID` | ERROR | Every shell present needs `assetInformation.globalAssetId` |
| `AAS_NO_SUBMODELS` | ERROR | At least one submodel: `submodels[]` of the Environment, or the shell's `submodels[]` references in the legacy envelope |
| `AAS_MISSING_WORKFLOW_SUBMODEL` | ERROR | No `WorkflowDefinition` submodel **and** no MWD submodel |
| `AAS_EMPTY_WORKFLOW` | ERROR | `WorkflowDefinition` has no node SMC |
| `AAS_NODE_MISSING_FIELDS` | ERROR | A node SMC lacks `kind` + `name` (or legacy `nodeCategory` + `nodeTypeId` + `label`) |
| `AAS_INVALID_KIND` | ERROR | `kind` not in `TRIGGER`, `TASK`, `GATEWAY` |
| `AAS_INVALID_CATEGORY` | ERROR | legacy `nodeCategory` not in `TRIGGER`, `AUTOMATIC`, `MANUAL`, `GATEWAY`, `STORAGE` |
| `AAS_NO_START_NODE` | WARNING | No `TRIGGER` or `TASK` node |
| `AAS_MWD_INVALID` | ERROR | An MWD submodel has no `ID` Property or its value is empty (the only mandatory element of the draft at root level) |
| `AAS_MWD_ONLY` | WARNING | No `WorkflowDefinition`; the document was imported as unconnected `TASK` nodes (shape (c)) |

## 8. Known lossy fields

Documented and asserted in `test/standards-roundtrip.e2e-spec.ts`.

| Field | Direction | Why | Effect after import |
|---|---|---|---|
| `node.position` (`x`, `y`) | not exported | layout is not part of the standard model | the importer computes a layered layout (grid for unconnected nodes) |
| `group.color`, group position and size | not exported | presentation only | default colour; bounds recomputed from the members |
| derived partner-only `PersonnelSpecification` entries | exported, not imported into `work.personnel` | they are a projection of `responsiblePartnerIds` | partners restored when the node has none; identical on the next export |
| claimant `PersonnelSpecification` entries (iteration shell) | exported, dropped on import | runtime fact, not job definition | none (iteration shells are not imported) |
| `HierarchyScope` equal to the primary partner id | exported, not stored | it is the exporter default | regenerated |
| absent `work` | exported with the defaults | `WorkType` `production` is stored on import | the node carries `work = { workType: 'production' }` afterwards; the next export is identical |
| MWD `ID`, `Version`, `Description`, `PublishedDate`, `DefinitionType` | exported, not stored in `work` | derived on every export | regenerated |
| local `id` of resource entries | not exported | UI handle | regenerated as `<kind>-<n>` |
| in shape (c): file contract, edges, groups | absent from a Work Master | the standard has no information hand-over element | to be completed in the editor |

Edge ids are **not** lossy: the `edgeId` annotation carries them verbatim although the
`idShort` is mangled. Not part of the AAS mapping before this feature and unchanged by it:
input/output `description`, `mimeTypes`, `maxSizeMB`, `defaultClassification`, the legacy `config`
object. The round-trip test is the authority on what is accepted as lossy.

## 9. Draft status of the IDTA 02100 identifiers

- IDTA 02100 is **not published**. The IRIs `https://admin-shell.io/idta/ManufacturingWorkDescription/1/0`
  (semanticId) and `https://admin-shell.io/idta/SubmodelTemplate/ManufacturingWorkDescription/1/0`
  (templateId) follow the IDTA id scheme the template would receive at publication; they are owned
  by IDTA, not registered yet and may change. Every consumer should treat them as **draft**.
- The Digital Thread follows the UCB draft v1.0 (27.01.2026) as corrected in the ENG draft package
  (`docs/idta-02100/out/template/`, `TEMPLATE-NOTES.md`). Deviations from the UCB document and
  AASX, all encoded in `mwd-spec.ts`:
  1. list containers are `ZeroToOne` and their items `ZeroToMany` (document: `[0..*]` on both);
  2. `PhysicalAssetSpecifications` semanticId corrected (typo `PhysicalAssetl...` in Table 1);
  3. `MaterialDefinition` semanticId ends in `/MaterialSpecification/MaterialDefinition` (document: `/Material`);
  4. idShort `AssemblyRelationship` without space (AASd-002);
  5. idShort `EquipmentSpecifications` in the plural, as in the document;
  6. every `<R>SpecificationProperty` is a `SubmodelElementCollection` (Table 12 header says list);
  7. list items carry no idShort (AASd-120);
  8. several `<R>SpecificationProperty` collections in one specification get a two-digit suffix
     from the second one on (`MaterialSpecificationProperty`, `MaterialSpecificationProperty01`,
     ...) so idShorts stay unique (AASd-022).
- When the template is published: bump the IRIs and any renamed element in `mwd-spec.ts`, keep
  accepting the draft IRIs on import for one release, update this document, the minimum example
  and the round-trip test in the same change.
- The reference files in `docs/idta-02100/out/` pass the official `aas-core3` verifier with
  0 findings; the exporter output is checked against the same verifier (tooling in
  `docs/idta-02100/README.md`).

## 10. Decisions the draft leaves open, as taken by the exporter

Listed here so the working team and reviewers can see them in one place:

| Topic | Decision |
|---|---|
| Submodel `idShort` of each MWD | `MWD_<nodeId>`; the submodel `id` stays the unique key |
| `Description` when the node has none | the node name, so the element is always present |
| `HierarchyScope` default | the primary responsible partner id |
| Missing class/object reference | `ReferenceElement` emitted without `value` (cardinality One in the draft) |
| `Quantity`, `QuantityUnit`, `ValueUnit` "if applicable" | element always present (cardinality One), `value` omitted when empty |
| Several nested specification properties | first one bare, then a two-digit suffix `01`, `02`, ... |
| `PublishedDate` | last save of the workflow head, or creation of the iteration; never the request time, so two exports of the same version are identical |
| Legacy node properties | `nodeCategory`, `nodeTypeId`, `responsiblePartnerId`, `responsiblePartner` are written only when the node still carries them; `positionX`, `positionY` and group `color` are never written; all are still imported |
