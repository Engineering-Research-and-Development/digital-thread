# AAS - Minimum Example for Digital Thread Import

**Standard:** IEC 63278 / Asset Administration Shell Part 1 (metamodel V3.0)
**Serialisation:** JSON, AAS `Environment` (`assetAdministrationShells`, `submodels`, `conceptDescriptions`)
**Companion:** `backend/docs/aas-mwd-mapping.md` in the repository holds the full IDTA 02100
"Manufacturing Work Description" mapping (every element, defaults, import shapes, lossy fields).

---

## 1. Core concepts - AAS ↔ Digital Thread mapping

| AAS concept | Digital Thread |
|---|---|
| `Environment` | One exported or imported document |
| `AssetAdministrationShell` (assetKind=Type) | `StateMachine` - workflow template |
| `AssetAdministrationShell` (assetKind=Instance) | `Iteration` - concrete execution |
| `Submodel` "WorkflowDefinition" (semanticId `urn:digital-thread:submodel:WorkflowDefinition:1:0`) | Workflow graph: nodes, edges, groups |
| `SubmodelElementCollection` `node_<id>` | `FlowNodeDef` - single step (`TRIGGER`, `TASK`, `GATEWAY`) |
| SMC `inputs` / `outputs` with children `input_n` / `output_n` | `NodeInputDef` / `NodeOutputDef` - file contract |
| `ReferenceElement` `sourceRef` inside an input | `PREDECESSOR` source: the output that feeds the input |
| `AnnotatedRelationshipElement` | `FlowEdgeDef` - connection between steps |
| SMC `groups` with children `group_n` | `FlowGroupDef` - visual group membership |
| `Submodel` "ManufacturingWorkDescription" (IDTA 02100, draft) | `work` of a `TASK` node: the job as an ISA-95 Work Master |
| `ReferenceElement` `workDescription` inside a node SMC | Link from the step to its Work Description |
| `ConceptDescription` | Definition of every `semanticId` used in the document |

The exporter writes this shape. The importer additionally accepts the legacy envelope of earlier
releases (section 4) and a document made only of Work Descriptions (section 5, shape (c)).

---

## 2. Minimum required elements

### 2.1 Environment root

| Field | Required | Notes |
|---|---|---|
| `assetAdministrationShells[]` | yes (optional for an MWD-only document, whose submodels must then carry `modelType: "Submodel"`) | The first shell is used |
| `submodels[]` | yes | Full submodels, inline. `WorkflowDefinition` and/or Work Descriptions |
| `conceptDescriptions[]` | no | The exporter emits one per `semanticId`; the importer does not need them |

### 2.2 Shell

| Field | Type | Required | Example |
|---|---|---|---|
| `modelType` | `"AssetAdministrationShell"` | yes | |
| `id` | URI/URN | yes | `"urn:digitalthread:aas:machine:<machineId>"` |
| `idShort` | `[a-zA-Z][a-zA-Z0-9_]*` | yes | `"CompositePanelWorkflow"` |
| `assetInformation.assetKind` | `"Type"` or `"Instance"` | yes | `"Type"` |
| `assetInformation.globalAssetId` | URI/URN | yes | `"urn:digitalthread:asset:workflow:<machineId>"` |
| `submodels[]` | `ModelReference` with one `Submodel` key per submodel | yes (at least 1) | points to `WorkflowDefinition` and to every Work Description |
| `description[]` | lang strings | - | becomes the workflow description |
| `derivedFrom` | `ModelReference` | Instance shells only | points to the workflow (Type) shell |

### 2.3 Submodel WorkflowDefinition

| Field | Type | Required | Notes |
|---|---|---|---|
| `modelType` | `"Submodel"` | yes | |
| `id` | URI/URN | yes | `"urn:digitalthread:sm:workflow-def:<machineId>"`; referenced by the shell and by every `ModelReference` inside |
| `idShort` | `"WorkflowDefinition"` | yes | Case-sensitive; a submodel whose `semanticId` is `urn:digital-thread:submodel:WorkflowDefinition:1:0` is recognised as well |
| `kind` | `"Instance"` | - | |
| `semanticId` | `urn:digital-thread:submodel:WorkflowDefinition:1:0` | recommended | |
| `submodelElements[]` | | yes (at least one node) | `workflowName`, `version`, `tags` Properties; node SMCs; edges; optional `groups` |

`tags` (workflow and node level) is a JSON array serialised as an `xs:string` value.

### 2.4 Each node (SubmodelElementCollection)

The SMC `idShort` is `node_` followed by the node id with every character outside
`[A-Za-z0-9_]` replaced by `_`; the importer reads the exact id from `nodeId`. Every element the
exporter writes carries a `semanticId` of the form
`urn:digital-thread:submodel:WorkflowDefinition:1:0/<suffix>`; the importer does not require them.

| idShort | Type | Required | Values / notes | semanticId suffix |
|---|---|---|---|---|
| `nodeId` | `xs:string` | yes | Unique identifier within the workflow | `Node/nodeId` |
| `kind` | `xs:string` | yes (or legacy `nodeCategory`) | `TRIGGER`, `TASK`, `GATEWAY` | `Node/kind` |
| `name` | `xs:string` | yes (or legacy `label`) | Label shown in the editor | `Node/name` |
| `description` | `xs:string` | - | Extended description | `Node/description` |
| `tags` | `xs:string` | - | JSON array | `Node/tags` |
| `responsiblePartnerIds` | `xs:string` | - | JSON array of partner ids, canonical; the first entry is the primary partner | `Node/responsiblePartnerIds` |
| `responsiblePartnerId` | `xs:string` | - | Primary partner id, equal to `responsiblePartnerIds[0]`; written when set | `Node/responsiblePartnerId` |
| `responsiblePartner` | `xs:string` | - | Legacy human-readable partner name or codes; written only when the node still carries it | `Node/responsiblePartner` |
| `gatewayLogic` | `xs:string` | `GATEWAY` only | `AND`, `OR`, `XOR` | `Node/gatewayLogic` |
| `groupId` | `xs:string` | - | Id of the group the node belongs to | `Node/groupId` |
| `inputs` | SMC | yes (may be empty) | children `input_n`, see 2.5 | `Node/Inputs` |
| `outputs` | SMC | yes (may be empty) | children `output_n`, see 2.5 | `Node/Outputs` |
| `workDescription` | `ReferenceElement` | `TASK` only, optional | `ModelReference` to the node's Work Description submodel (2.8) | `Node/workDescription` |
| `nodeCategory`, `nodeTypeId` | `xs:string` | legacy | Written only when the node still carries them (older machines); read when `kind` is absent | `Node/nodeCategory`, `Node/nodeTypeId` |
| `label` | `xs:string` | legacy | Read when `name` is absent; not written | - |
| `positionX`, `positionY` | `xs:float` | legacy | Read if present; no longer written, the editor lays the graph out | - |

An empty container (for example `inputs` of a trigger) is written without `value`.

### 2.5 Inputs and outputs

`input_n` (SMC, semanticId suffix `Node/Input`):

| idShort | Type | Required | Notes |
|---|---|---|---|
| `id` | `xs:string` | yes | Slot id, unique within the node |
| `name` | `xs:string` | - | Defaults to `id` |
| `source` | `xs:string` | - | `MANUAL` (default), `DATASOURCE:<dataSourceId>`, `PREDECESSOR:<nodeId>.<outputId>` |
| `sourceRef` | `ReferenceElement` | - | `ModelReference` `[Submodel, node_<id>, outputs, output_n]` to the feeding output; written for `PREDECESSOR` sources, `source` stays authoritative on import |
| `cardinality` | `xs:string` | - | `ONE` (default) or `MANY` |
| `required` | `xs:boolean` | - | `true` / `false` |
| `fileTypes` | `xs:string` | - | JSON array of accepted extensions |

`output_n` (SMC, semanticId suffix `Node/Output`): `id`, `name`, `cardinality`, `required`,
`fileTypes` with the same meaning.

### 2.6 Edges

| Field | Value |
|---|---|
| `modelType` | `AnnotatedRelationshipElement` (legacy `AnnotatedRelationship` accepted) |
| `idShort` | `edge_<edgeId>` with characters outside `[A-Za-z0-9_]` replaced by `_`; an edge without an id uses `<source>-<target>` |
| `semanticId` | suffix `Edge` |
| `first` / `second` | `ModelReference` with keys `[Submodel <WorkflowDefinition id>, SubmodelElementCollection node_<id>]`; a single `SubmodelElementCollection` key is also accepted |
| `annotations[]` | `edgeId` Property with the exact edge id (suffix `Edge/edgeId`; the importer prefers it to the mangled `idShort`) and an optional `label` Property (suffix `Edge/label`) |

Edges must be inside `WorkflowDefinition.submodelElements`.

### 2.7 Node groups

Groups are exported as an SMC `groups` (suffix `Groups`) with one child SMC per group
(`group_0`, `group_1`, ..., suffix `Group`) holding `groupId`, `name` and `nodeIds` (JSON array of
node ids). Colours and geometry are not exported. On import, members that match no node are
dropped, empty groups are discarded, each node's `groupId` is realigned and the editor recomputes
position and size from the member nodes.

### 2.8 Manufacturing Work Description (IDTA 02100, draft)

Every `TASK` node is exported a second time as its own submodel following the IDTA 02100
"Manufacturing Work Description" template (ISA-95 Work Master). ISA-95 Part 4 pairs the Work
Master with the Workflow Specification the same way: `WorkflowDefinition` orders the jobs, the
Work Description describes each job. Triggers and gateways are not jobs and have none.

| Field | Value |
|---|---|
| `id` | `urn:digitalthread:sm:mwd:<machineId>:<nodeId>` |
| `idShort` / `kind` | `MWD_<nodeId>` (characters outside `[A-Za-z0-9_]` replaced by `_`) / `Instance` |
| `semanticId` | `https://admin-shell.io/idta/ManufacturingWorkDescription/1/0` (draft IRI owned by IDTA, not yet published) |
| `administration.templateId` | `https://admin-shell.io/idta/SubmodelTemplate/ManufacturingWorkDescription/1/0` (draft) |
| Mandatory element | `ID` Property (= `nodeId`); everything else is optional |
| Content | from the node's `work` field (editor tab "Work description"): `HierarchyScope`, `WorkType`, `Duration`, `DurationUnit`, `ParameterSpecifications`, `PersonnelSpecifications`, `EquipmentSpecifications`, `PhysicalAssetSpecifications`, `MaterialSpecifications` |
| Defaults without `work` | `ID` = node id, `Version` = workflow version, `Description` = node description (else node name), `HierarchyScope` = primary responsible partner id, `WorkType` = `production`, `DefinitionType` = `pattern`, one `PersonnelSpecification` per responsible partner (`PersonnelClass` = `urn:digitalthread:partner:<id>`, `PersonnelUse` = `responsible partner`). Empty lists are omitted; elements of cardinality One (`Quantity`, `QuantityUnit`, `ValueUnit`, the two references of a resource) are present without `value` when unknown |

The element-by-element table, the cardinalities, the import of Work-Description-only documents and
the deviations from the UCB draft are in `backend/docs/aas-mwd-mapping.md`.

---

## 3. Annotated complete example

One trigger, one task with a small `work`, one edge. This is the minimum the importer accepts
with a Work Description; the exporter additionally writes a `semanticId` on every
`WorkflowDefinition` element (suffixes in section 2) and one `ConceptDescription` per `semanticId`
(one is shown).

```json
{
  "assetAdministrationShells": [
    {
      "modelType": "AssetAdministrationShell",
      "id": "urn:digitalthread:aas:machine:composite-panel",
      "idShort": "CompositePanelWorkflow",
      "description": [{ "language": "en", "text": "Workflow for composite panel manufacturing" }],
      "assetInformation": { "assetKind": "Type", "globalAssetId": "urn:digitalthread:asset:workflow:composite-panel" },
      "submodels": [
        { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:digitalthread:sm:workflow-def:composite-panel" }] },
        { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:digitalthread:sm:mwd:composite-panel:layup" }] }
      ]
    }
  ],

  "submodels": [
    {
      "modelType": "Submodel",
      "id": "urn:digitalthread:sm:workflow-def:composite-panel",
      "idShort": "WorkflowDefinition",
      "kind": "Instance",
      "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:digital-thread:submodel:WorkflowDefinition:1:0" }] },
      "description": [{ "language": "en", "text": "Workflow definition for Composite Panel Workflow v1.0.0" }],
      "submodelElements": [

        { "modelType": "Property", "idShort": "workflowName", "valueType": "xs:string", "value": "Composite Panel Workflow" },
        { "modelType": "Property", "idShort": "version",      "valueType": "xs:string", "value": "1.0.0" },
        { "modelType": "Property", "idShort": "tags",         "valueType": "xs:string", "value": "[\"aerospace\",\"composites\"]" },

        {
          "modelType": "SubmodelElementCollection",
          "idShort": "node_design",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:digital-thread:submodel:WorkflowDefinition:1:0/Node" }] },
          "value": [
            { "modelType": "Property", "idShort": "nodeId",                "valueType": "xs:string", "value": "design" },
            { "modelType": "Property", "idShort": "kind",                  "valueType": "xs:string", "value": "TRIGGER" },
            { "modelType": "Property", "idShort": "name",                  "valueType": "xs:string", "value": "CAD design release" },
            { "modelType": "Property", "idShort": "description",           "valueType": "xs:string", "value": "Upload the released STEP model" },
            { "modelType": "Property", "idShort": "responsiblePartner",    "valueType": "xs:string", "value": "CAI" },
            { "modelType": "Property", "idShort": "responsiblePartnerIds", "valueType": "xs:string", "value": "[\"p-cai\"]" },
            { "modelType": "SubmodelElementCollection", "idShort": "inputs" },
            {
              "modelType": "SubmodelElementCollection",
              "idShort": "outputs",
              "value": [
                {
                  "modelType": "SubmodelElementCollection",
                  "idShort": "output_0",
                  "value": [
                    { "modelType": "Property", "idShort": "id",          "valueType": "xs:string",  "value": "cad" },
                    { "modelType": "Property", "idShort": "name",        "valueType": "xs:string",  "value": "Released CAD" },
                    { "modelType": "Property", "idShort": "cardinality", "valueType": "xs:string",  "value": "ONE" },
                    { "modelType": "Property", "idShort": "required",    "valueType": "xs:boolean", "value": "true" },
                    { "modelType": "Property", "idShort": "fileTypes",   "valueType": "xs:string",  "value": "[\".step\"]" }
                  ]
                }
              ]
            }
          ]
        },

        {
          "modelType": "SubmodelElementCollection",
          "idShort": "node_layup",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:digital-thread:submodel:WorkflowDefinition:1:0/Node" }] },
          "value": [
            { "modelType": "Property", "idShort": "nodeId",                "valueType": "xs:string", "value": "layup" },
            { "modelType": "Property", "idShort": "kind",                  "valueType": "xs:string", "value": "TASK" },
            { "modelType": "Property", "idShort": "name",                  "valueType": "xs:string", "value": "ATL lay-up" },
            { "modelType": "Property", "idShort": "description",           "valueType": "xs:string", "value": "Automated tape laying of the panel" },
            { "modelType": "Property", "idShort": "responsiblePartner",    "valueType": "xs:string", "value": "AIM" },
            { "modelType": "Property", "idShort": "responsiblePartnerIds", "valueType": "xs:string", "value": "[\"p-aim\"]" },
            {
              "modelType": "SubmodelElementCollection",
              "idShort": "inputs",
              "value": [
                {
                  "modelType": "SubmodelElementCollection",
                  "idShort": "input_0",
                  "value": [
                    { "modelType": "Property", "idShort": "id",     "valueType": "xs:string", "value": "cad-in" },
                    { "modelType": "Property", "idShort": "name",   "valueType": "xs:string", "value": "CAD file" },
                    { "modelType": "Property", "idShort": "source", "valueType": "xs:string", "value": "PREDECESSOR:design.cad" },
                    {
                      "modelType": "ReferenceElement", "idShort": "sourceRef",
                      "value": { "type": "ModelReference", "keys": [
                        { "type": "Submodel", "value": "urn:digitalthread:sm:workflow-def:composite-panel" },
                        { "type": "SubmodelElementCollection", "value": "node_design" },
                        { "type": "SubmodelElementCollection", "value": "outputs" },
                        { "type": "SubmodelElementCollection", "value": "output_0" } ] }
                    },
                    { "modelType": "Property", "idShort": "cardinality", "valueType": "xs:string",  "value": "ONE" },
                    { "modelType": "Property", "idShort": "required",    "valueType": "xs:boolean", "value": "true" },
                    { "modelType": "Property", "idShort": "fileTypes",   "valueType": "xs:string",  "value": "[\".step\"]" }
                  ]
                }
              ]
            },
            {
              "modelType": "SubmodelElementCollection",
              "idShort": "outputs",
              "value": [
                {
                  "modelType": "SubmodelElementCollection",
                  "idShort": "output_0",
                  "value": [
                    { "modelType": "Property", "idShort": "id",          "valueType": "xs:string",  "value": "layup-report" },
                    { "modelType": "Property", "idShort": "name",        "valueType": "xs:string",  "value": "Lay-up report" },
                    { "modelType": "Property", "idShort": "cardinality", "valueType": "xs:string",  "value": "ONE" },
                    { "modelType": "Property", "idShort": "required",    "valueType": "xs:boolean", "value": "true" },
                    { "modelType": "Property", "idShort": "fileTypes",   "valueType": "xs:string",  "value": "[\".pdf\"]" }
                  ]
                }
              ]
            },
            {
              "modelType": "ReferenceElement",
              "idShort": "workDescription",
              "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:digital-thread:submodel:WorkflowDefinition:1:0/Node/workDescription" }] },
              "value": { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:digitalthread:sm:mwd:composite-panel:layup" }] }
            }
          ]
        },

        {
          "modelType": "AnnotatedRelationshipElement",
          "idShort": "edge_e1",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:digital-thread:submodel:WorkflowDefinition:1:0/Edge" }] },
          "first":  { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:digitalthread:sm:workflow-def:composite-panel" }, { "type": "SubmodelElementCollection", "value": "node_design" }] },
          "second": { "type": "ModelReference", "keys": [{ "type": "Submodel", "value": "urn:digitalthread:sm:workflow-def:composite-panel" }, { "type": "SubmodelElementCollection", "value": "node_layup" }] },
          "annotations": [
            { "modelType": "Property", "idShort": "edgeId", "valueType": "xs:string", "value": "e1" }
          ]
        }
      ]
    },

    {
      "modelType": "Submodel",
      "id": "urn:digitalthread:sm:mwd:composite-panel:layup",
      "idShort": "MWD_layup",
      "kind": "Instance",
      "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0" }] },
      "administration": { "templateId": "https://admin-shell.io/idta/SubmodelTemplate/ManufacturingWorkDescription/1/0" },
      "description": [{ "language": "en", "text": "Manufacturing Work Description (pattern) of workflow step \"ATL lay-up\"" }],
      "submodelElements": [
        { "modelType": "Property", "idShort": "ID", "valueType": "xs:string", "value": "layup",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/ID" }] } },
        { "modelType": "Property", "idShort": "Version", "valueType": "xs:string", "value": "1.0.0",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/Version" }] } },
        { "modelType": "MultiLanguageProperty", "idShort": "Description", "value": [{ "language": "en", "text": "Automated tape laying of the panel" }],
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/Description" }] } },
        { "modelType": "Property", "idShort": "HierarchyScope", "valueType": "xs:string", "value": "AIM automated composite manufacturing cell",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/HierarchyScope" }] } },
        { "modelType": "Property", "idShort": "WorkType", "valueType": "xs:string", "value": "production",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/WorkType" }] } },
        { "modelType": "Property", "idShort": "Duration", "valueType": "xs:string", "value": "4",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/Duration" }] } },
        { "modelType": "Property", "idShort": "DurationUnit", "valueType": "xs:string", "value": "h",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/DurationUnit" }] } },
        { "modelType": "Property", "idShort": "PublishedDate", "valueType": "xs:dateTime", "value": "2026-11-25T10:00:00Z",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PublishedDate" }] } },
        { "modelType": "Property", "idShort": "DefinitionType", "valueType": "xs:string", "value": "pattern",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/DefinitionType" }] } },

        {
          "modelType": "SubmodelElementList",
          "idShort": "PersonnelSpecifications",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications" }] },
          "typeValueListElement": "SubmodelElementCollection",
          "orderRelevant": false,
          "semanticIdListElement": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications/PersonnelSpecification" }] },
          "value": [
            {
              "modelType": "SubmodelElementCollection",
              "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications/PersonnelSpecification" }] },
              "value": [
                { "modelType": "ReferenceElement", "idShort": "PersonnelClass",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications/PersonnelSpecification/PersonnelClass" }] },
                  "value": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:digitalthread:partner:p-aim" }] } },
                { "modelType": "ReferenceElement", "idShort": "Person",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications/PersonnelSpecification/Person" }] } },
                { "modelType": "Property", "idShort": "PersonnelUse", "valueType": "xs:string", "value": "responsible partner",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications/PersonnelSpecification/PersonnelUse" }] } },
                { "modelType": "Property", "idShort": "Quantity", "valueType": "xs:string",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications/PersonnelSpecification/Quantity" }] } },
                { "modelType": "Property", "idShort": "QuantityUnit", "valueType": "xs:string",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/PersonnelSpecifications/PersonnelSpecification/QuantityUnit" }] } }
              ]
            }
          ]
        },

        {
          "modelType": "SubmodelElementList",
          "idShort": "EquipmentSpecifications",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications" }] },
          "typeValueListElement": "SubmodelElementCollection",
          "orderRelevant": false,
          "semanticIdListElement": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification" }] },
          "value": [
            {
              "modelType": "SubmodelElementCollection",
              "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification" }] },
              "value": [
                { "modelType": "ReferenceElement", "idShort": "EquipmentClass",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification/EquipmentClass" }] },
                  "value": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:compstlar:equipment-class:atl-cell" }] } },
                { "modelType": "ReferenceElement", "idShort": "Equipment",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification/Equipment" }] } },
                { "modelType": "MultiLanguageProperty", "idShort": "Description", "value": [{ "language": "en", "text": "Automated tape laying (ATL) cell" }],
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification/Description" }] } },
                { "modelType": "Property", "idShort": "EquipmentUse", "valueType": "xs:string", "value": "production",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification/EquipmentUse" }] } },
                { "modelType": "Property", "idShort": "Quantity", "valueType": "xs:string", "value": "1",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification/Quantity" }] } },
                { "modelType": "Property", "idShort": "QuantityUnit", "valueType": "xs:string", "value": "unit",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/EquipmentSpecifications/EquipmentSpecification/QuantityUnit" }] } }
              ]
            }
          ]
        },

        {
          "modelType": "SubmodelElementList",
          "idShort": "MaterialSpecifications",
          "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications" }] },
          "typeValueListElement": "SubmodelElementCollection",
          "orderRelevant": false,
          "semanticIdListElement": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification" }] },
          "value": [
            {
              "modelType": "SubmodelElementCollection",
              "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification" }] },
              "value": [
                { "modelType": "ReferenceElement", "idShort": "MaterialClass",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification/MaterialClass" }] },
                  "value": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "urn:compstlar:material-class:cf-gr-tp-ud-tape" }] } },
                { "modelType": "ReferenceElement", "idShort": "MaterialDefinition",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification/MaterialDefinition" }] } },
                { "modelType": "MultiLanguageProperty", "idShort": "Description", "value": [{ "language": "en", "text": "CF/Gr-TP unidirectional tape" }],
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification/Description" }] } },
                { "modelType": "Property", "idShort": "MaterialUse", "valueType": "xs:string", "value": "Consumed",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification/MaterialUse" }] } },
                { "modelType": "Property", "idShort": "Quantity", "valueType": "xs:string", "value": "12",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification/Quantity" }] } },
                { "modelType": "Property", "idShort": "QuantityUnit", "valueType": "xs:string", "value": "kg",
                  "semanticId": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/MaterialSpecifications/MaterialSpecification/QuantityUnit" }] } }
              ]
            }
          ]
        }
      ]
    }
  ],

  "conceptDescriptions": [
    {
      "modelType": "ConceptDescription",
      "id": "https://admin-shell.io/idta/ManufacturingWorkDescription/1/0/WorkType",
      "idShort": "WorkType",
      "embeddedDataSpecifications": [
        {
          "dataSpecification": { "type": "ExternalReference", "keys": [{ "type": "GlobalReference", "value": "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIEC61360/3/0" }] },
          "dataSpecificationContent": {
            "modelType": "DataSpecificationIec61360",
            "preferredName": [{ "language": "en", "text": "WorkType" }],
            "definition": [{ "language": "en", "text": "Describes the category of work. Can be defined as production, maintenance, quality, inventory or mixed" }],
            "dataType": "STRING"
          }
        }
      ]
    }
  ]
}
```

What the import produces: a workflow "Composite Panel Workflow" v1.0.0 with a `TRIGGER` `design`
(partner `p-cai`, output `cad`), a `TASK` `layup` (partner `p-aim`, input `cad-in` fed by
`design.cad`, output `layup-report`) whose `work` is `{ hierarchyScope, workType: "production",
duration: "4", durationUnit: "h", equipment: [1 entry], materials: [1 entry] }`, and the edge
`e1`. The derived `PersonnelSpecification` of partner `p-aim` is not copied into `work.personnel`
(it is recomputed on export); `hierarchyScope` is kept because it differs from the partner id (a
scope equal to the primary partner id is the exporter's default and is not stored); the resource
entries get local ids `equipment-1` and `material-1`; positions are computed by the importer
(layers along the edges) and can be rearranged in the editor.

---

## 4. Legacy envelope (import only)

Earlier releases exported a single shell with the submodel inline under `submodelInline`, layout
coordinates and the legacy node vocabulary. The importer still accepts it; the exporter no longer
writes it.

```json
{
  "modelType": "AssetAdministrationShell",
  "id": "urn:myorg:aas:composite-panel-workflow:1.0",
  "idShort": "CompositePanelWorkflow",
  "assetInformation": { "assetKind": "Type", "globalAssetId": "urn:myorg:asset:composite-panel-process" },
  "submodels": [
    { "type": "ExternalReference", "keys": [{ "type": "Submodel", "value": "urn:myorg:sm:composite-panel-workflow-def:1.0" }] }
  ],
  "submodelInline": [
    {
      "modelType": "Submodel",
      "id": "urn:myorg:sm:composite-panel-workflow-def:1.0",
      "idShort": "WorkflowDefinition",
      "submodelElements": [
        { "modelType": "Property", "idShort": "workflowName", "valueType": "xs:string", "value": "Composite Panel Workflow" },
        { "modelType": "Property", "idShort": "version",      "valueType": "xs:string", "value": "1.0.0" },
        {
          "modelType": "SubmodelElementCollection",
          "idShort": "node_step1",
          "value": [
            { "modelType": "Property", "idShort": "nodeId",             "valueType": "xs:string", "value": "step1" },
            { "modelType": "Property", "idShort": "nodeCategory",       "valueType": "xs:string", "value": "MANUAL" },
            { "modelType": "Property", "idShort": "nodeTypeId",         "valueType": "xs:string", "value": "CAD_RELEASE" },
            { "modelType": "Property", "idShort": "label",              "valueType": "xs:string", "value": "CAD Design Release" },
            { "modelType": "Property", "idShort": "responsiblePartner", "valueType": "xs:string", "value": "Design Authority" },
            { "modelType": "Property", "idShort": "positionX",          "valueType": "xs:float",  "value": "100" },
            { "modelType": "Property", "idShort": "positionY",          "valueType": "xs:float",  "value": "200" }
          ]
        },
        {
          "modelType": "SubmodelElementCollection",
          "idShort": "node_step2",
          "value": [
            { "modelType": "Property", "idShort": "nodeId",       "valueType": "xs:string", "value": "step2" },
            { "modelType": "Property", "idShort": "nodeCategory", "valueType": "xs:string", "value": "AUTOMATIC" },
            { "modelType": "Property", "idShort": "nodeTypeId",   "valueType": "xs:string", "value": "FEA_STRUCTURAL" },
            { "modelType": "Property", "idShort": "label",        "valueType": "xs:string", "value": "FEA Analysis" }
          ]
        },
        {
          "modelType": "AnnotatedRelationship",
          "idShort": "edge_e1",
          "first":  { "type": "ModelReference", "keys": [{ "type": "SubmodelElementCollection", "value": "node_step1" }] },
          "second": { "type": "ModelReference", "keys": [{ "type": "SubmodelElementCollection", "value": "node_step2" }] },
          "annotations": []
        }
      ]
    }
  ]
}
```

Legacy values are normalised on import: `nodeCategory` `MANUAL`/`AUTOMATIC`/`STORAGE` become
`kind: TASK`, `label` becomes `name`, `positionX`/`positionY` are used as the initial layout.

---

## 5. Validation rules

The backend enforces these rules (`POST /api/v1/aas/validate` returns them without importing):

| Code | Level | Rule |
|---|---|---|
| `AAS_INVALID_ROOT` | ERROR | Root must be an Environment (`submodels[]`, optional `assetAdministrationShells[]`) or a legacy shell with `modelType: "AssetAdministrationShell"` |
| `AAS_MISSING_GLOBAL_ASSET_ID` | ERROR | Every shell present needs `assetInformation.globalAssetId` |
| `AAS_NO_SUBMODELS` | ERROR | At least one submodel: `submodels[]` of the Environment, or the shell's `submodels[]` references in the legacy envelope |
| `AAS_MISSING_WORKFLOW_SUBMODEL` | ERROR | No Submodel with `idShort: "WorkflowDefinition"` and no Manufacturing Work Description submodel |
| `AAS_EMPTY_WORKFLOW` | ERROR | `WorkflowDefinition` must contain at least one node SMC |
| `AAS_NODE_MISSING_FIELDS` | ERROR | Each node SMC must carry `kind` + `name` (or legacy `nodeCategory` + `nodeTypeId` + `label`) |
| `AAS_INVALID_KIND` | ERROR | `kind` must be one of `TRIGGER`, `TASK`, `GATEWAY` |
| `AAS_INVALID_CATEGORY` | ERROR | legacy `nodeCategory` must be one of `TRIGGER`, `AUTOMATIC`, `MANUAL`, `GATEWAY`, `STORAGE` |
| `AAS_NO_START_NODE` | WARNING | No `TRIGGER` or `TASK` node found - the flow may have no entry point |
| `AAS_MWD_INVALID` | ERROR | A Manufacturing Work Description submodel has no `ID` Property, or its value is empty |
| `AAS_MWD_ONLY` | WARNING | The document contains Work Descriptions but no `WorkflowDefinition`: one unconnected `TASK` node is created per Work Description, with its `work` filled and an empty file contract, to be wired in the editor (shape (c)) |

---

## 6. Common errors

| Error | Cause | Fix |
|---|---|---|
| `AAS_INVALID_ROOT` | Root is a bare Submodel | Wrap it in an Environment: `{ "assetAdministrationShells": [shell], "submodels": [submodel] }` |
| `AAS_MISSING_GLOBAL_ASSET_ID` | `assetInformation` missing on the shell | Add `assetInformation: { assetKind, globalAssetId }` |
| `AAS_MISSING_WORKFLOW_SUBMODEL` | Submodel has the wrong `idShort` | The name **must** be exactly `"WorkflowDefinition"` |
| `AAS_INVALID_CATEGORY` | Value like `"automatic"` (lowercase) | Values are case-sensitive: `AUTOMATIC`, not `automatic` |
| `AAS_MWD_INVALID` | Work Description without `ID` | Add a Property `ID` (`xs:string`) with the step identifier |
| `AAS_INVALID_ROOT` on a Work-Description-only file | No shell, and the submodels lack `modelType` | Add `"modelType": "Submodel"` to every submodel (or add a shell) so the document is detected as an Environment |
| Edges not imported | `AnnotatedRelationshipElement` placed outside the Submodel | Put edges **inside** `WorkflowDefinition.submodelElements` |
| `work` not imported | `workDescription` points to a submodel `id` that is not in `submodels[]`, and the Work Description's `ID` differs from the node's `nodeId` | Fix the reference, or set `ID` = `nodeId` |
| Derived personnel entry missing after re-import | Entries with `PersonnelClass` `urn:digitalthread:partner:<id>` and `PersonnelUse` `responsible partner` are projections of the node's partners | Expected; they are recomputed on the next export |

---

## 7. Iteration (Instance) shell - IDTA standard submodels

The sections above describe the **Type** shell (`StateMachine` → `WorkflowDefinition`). The
iteration page exports an **Instance** shell (`GET /api/v1/aas/iteration/:id/shell`) as the same
Environment envelope: one shell with `assetKind: Instance` and `derivedFrom` pointing to the
workflow shell, the submodels below inline in `submodels[]`, and their ConceptDescriptions. Nodes
and partners are read from the **frozen** `StateMachineVersion` the iteration pins, never from the
editable head. Each Work Description carries `DefinitionType` `instance`, the frozen version's
label as `Version` and, when the node was claimed, one extra `PersonnelSpecification` whose
`Person` is `urn:digitalthread:user:<userId>` with `PersonnelUse` `claimant` (user ids only). No
user e-mail address is exported.

| Submodel | IDTA template | Root `semanticId` | Source data |
|---|---|---|---|
| **TechnicalData** | IDTA 02003 v2.0 | ECLASS IRDI `0173-1#01-AHX837#002` | iteration metadata + node outputs |
| **HandoverDocumentation** | IDTA 02004 v2.0 | ECLASS IRDI `0173-1#01-AHF578#003` | released documents (ply book, release letters) |
| **Digital Nameplate** | IDTA 02006 v3.0 | `https://admin-shell.io/idta/nameplate/3/0/Nameplate` | the iteration's attached **Product** (see below) |
| **ManufacturingWorkDescription** (`MWD_<nodeId>`, one per `TASK` node) | IDTA 02100 (draft) | `https://admin-shell.io/idta/ManufacturingWorkDescription/1/0` | the frozen node's `work`, `DefinitionType` = `instance`, id `urn:digitalthread:sm:mwd:iteration:<iterationId>:<nodeId>` |
| **ProvenanceLog** | - (platform custom) | `urn:digital-thread:submodel:ProvenanceLog:1:0` | W3C PROV-O lineage |
| **WorkflowExecution** | - (platform custom) | `urn:digital-thread:submodel:WorkflowExecution:1:0` | per-node runtime state |

### 7.1 Digital Nameplate for the attached Product

When the iteration has an attached **Product** (see the Product registry), the shell emits a
Digital Nameplate (IDTA 02006 v3.0) describing it. Fields are keyed to ECLASS / IEC-CDD IRDIs:

| Nameplate element | Source |
|---|---|
| `URIOfTheProduct` | `Product.urn` |
| `ManufacturerName` | owning partner's display name |
| `ManufacturerProductDesignation` | `Product.name` |
| `AddressInformation.NationalCode` | owning partner's ISO 3166-1 alpha-2 `country` |

### 7.2 The two custom submodels are custom on purpose

`ProvenanceLog` and `WorkflowExecution` are **custom platform submodels** with
Digital-Thread-native `semanticId`s, by design:

- **ProvenanceLog** - there is **no IDTA standard** for W3C PROV-O lineage, so the DT defines its
  own. (The IDTA working group has a *draft* ProvenanceLog template; the DT will align if/when it
  is published.)
- **WorkflowExecution** - per-node runtime state of an iteration (status, timestamps, produced
  files). IDTA 02100 describes the job (the Work Master); it does not cover the execution record,
  so this submodel stays custom. Its `NodeStates/Node_<id>/NodeId` equals the `ID` of the node's
  Work Description, which links the two.

AutomationML is **not** offered for iterations: CAEX describes static engineering structure, not
workflow runtime state.
