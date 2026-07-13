# AAS - Minimum Example for Digital Thread Import

**Standard:** IEC 63278 / Asset Administration Shell Part 2 (Metamodel)
**Serialisation:** JSON (AAS API v3 schema)

---

## 1. Core concepts - AAS ↔ Digital Thread mapping

| AAS concept | Digital Thread |
|---|---|
| `AssetAdministrationShell` (assetKind=Type) | `StateMachine` - workflow template |
| `AssetAdministrationShell` (assetKind=Instance) | `Iteration` - concrete execution |
| `Submodel` "WorkflowDefinition" | Workflow graph (nodes + edges) |
| `SubmodelElementCollection` (with `kind` and nested `inputs`/`outputs`) | `FlowNodeDef` - single step |
| `AnnotatedRelationship` | `FlowEdgeDef` - connection between steps |
| `BasicEventElement` | `TimelineEvent` - runtime event |
| `Operation` | AUTOMATIC handler (apiEndpoint) |
| Submodel "NodeTypeCatalog" | Node-type catalogue |

---

## 2. Minimum required elements

### Level 1 - AAS Shell

| Field | Type | Required | Example |
|---|---|---|---|
| `modelType` | `"AssetAdministrationShell"` | ✅ | `"AssetAdministrationShell"` |
| `id` | URI/URN | ✅ | `"urn:myorg:aas:my-workflow:1.0"` |
| `idShort` | alphanum/underscore string | ✅ | `"MyWorkflow"` |
| `assetInformation.assetKind` | `"Type"` or `"Instance"` | ✅ | `"Type"` |
| `assetInformation.globalAssetId` | URI/URN | ✅ | `"urn:myorg:asset:my-process"` |
| `submodels[]` | array of references | ✅ (≥1) | reference to WorkflowDefinition |

### Level 2 - Submodel WorkflowDefinition

| Field | Type | Required | Notes |
|---|---|---|---|
| `idShort` | `"WorkflowDefinition"` | ✅ | Case-sensitive |
| `submodelElements[]` | array of SMC | ✅ (≥1) | At least one node |

### Level 3 - Each node (SubmodelElementCollection)

| Property idShort | Type | Required | Valid values |
|---|---|---|---|
| `nodeCategory` | `xs:string` | ✅ | `TRIGGER`, `AUTOMATIC`, `MANUAL`, `GATEWAY` |
| `nodeTypeId` | `xs:string` | ✅ | e.g. `CAD_RELEASE`, `AI_DEFECT_DETECTION` - see template nodes catalogue |
| `label` | `xs:string` | ✅ | Label shown in the frontend |
| `nodeId` | `xs:string` | ✅ | Unique identifier within the workflow |
| `description` | `xs:string` | - | Extended description |
| `responsiblePartner` | `xs:string` | - | One or more partner codes, e.g. `"CAI"` or `"CAI,AIM"`. The exporter emits the full `responsiblePartnerIds` list (comma-separated); the importer accepts a single code or a list. |
| `positionX` / `positionY` | `xs:float` | - | Canvas layout coordinates |

---

## 3. Annotated complete example

```json
{
  "modelType": "AssetAdministrationShell",
  "id": "urn:myorg:aas:composite-panel-workflow:1.0",
  "idShort": "CompositePanelWorkflow",

  "assetInformation": {
    "assetKind": "Type",
    "globalAssetId": "urn:myorg:asset:composite-panel-process"
  },

  "description": [
    { "language": "en", "text": "Workflow for composite panel manufacturing and inspection" }
  ],

  "submodels": [
    {
      "type": "ExternalReference",
      "keys": [{ "type": "Submodel", "value": "urn:myorg:sm:composite-panel-workflow-def:1.0" }]
    }
  ],

  "submodelInline": [
    {
      "modelType": "Submodel",
      "id": "urn:myorg:sm:composite-panel-workflow-def:1.0",
      "idShort": "WorkflowDefinition",

      "submodelElements": [

        { "modelType": "Property", "idShort": "workflowName", "valueType": "xs:string", "value": "Composite Panel Workflow" },
        { "modelType": "Property", "idShort": "version",      "valueType": "xs:string", "value": "1.0.0" },
        { "modelType": "Property", "idShort": "tags",         "valueType": "xs:string", "value": "[\"aerospace\",\"composites\"]" },

        {
          "modelType": "SubmodelElementCollection",
          "idShort": "node_step1",
          "value": [
            { "modelType": "Property", "idShort": "nodeId",            "valueType": "xs:string", "value": "step1" },
            { "modelType": "Property", "idShort": "nodeCategory",      "valueType": "xs:string", "value": "MANUAL" },
            { "modelType": "Property", "idShort": "nodeTypeId",        "valueType": "xs:string", "value": "CAD_RELEASE" },
            { "modelType": "Property", "idShort": "label",             "valueType": "xs:string", "value": "CAD Design Release" },
            { "modelType": "Property", "idShort": "description",       "valueType": "xs:string", "value": "Upload final STEP/CATPART file" },
            { "modelType": "Property", "idShort": "responsiblePartner","valueType": "xs:string", "value": "Design Authority" },
            { "modelType": "Property", "idShort": "positionX",         "valueType": "xs:float",  "value": "100" },
            { "modelType": "Property", "idShort": "positionY",         "valueType": "xs:float",  "value": "200" },
            {
              "modelType": "SubmodelElementCollection",
              "idShort": "inputs",
              "value": [
                {
                  "modelType": "SubmodelElementCollection",
                  "idShort": "input_0",
                  "value": [
                    { "modelType": "Property", "idShort": "id",       "valueType": "xs:string", "value": "cad-file" },
                    { "modelType": "Property", "idShort": "label",    "valueType": "xs:string", "value": "CAD File" },
                    { "modelType": "Property", "idShort": "source",   "valueType": "xs:string", "value": "MANUAL" },
                    { "modelType": "Property", "idShort": "required", "valueType": "xs:boolean","value": "true" },
                    { "modelType": "Property", "idShort": "fileTypes","valueType": "xs:string", "value": "[\".step\",\".catpart\"]" }
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
                    { "modelType": "Property", "idShort": "id",       "valueType": "xs:string", "value": "cad-out" },
                    { "modelType": "Property", "idShort": "label",    "valueType": "xs:string", "value": "Released CAD" },
                    { "modelType": "Property", "idShort": "fileTypes","valueType": "xs:string", "value": "[\".step\"]" }
                  ]
                }
              ]
            }
          ]
        },

        {
          "modelType": "SubmodelElementCollection",
          "idShort": "node_step2",
          "value": [
            { "modelType": "Property", "idShort": "nodeId",       "valueType": "xs:string", "value": "step2" },
            { "modelType": "Property", "idShort": "nodeCategory", "valueType": "xs:string", "value": "AUTOMATIC" },
            { "modelType": "Property", "idShort": "nodeTypeId",   "valueType": "xs:string", "value": "FEA_STRUCTURAL" },
            { "modelType": "Property", "idShort": "label",        "valueType": "xs:string", "value": "FEA Analysis" },
            { "modelType": "Property", "idShort": "positionX",    "valueType": "xs:float",  "value": "350" },
            { "modelType": "Property", "idShort": "positionY",    "valueType": "xs:float",  "value": "200" }
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

---

## 4. Validation rules

The backend enforces these rules:

| Code | Level | Rule |
|---|---|---|
| `AAS_INVALID_ROOT` | ERROR | `modelType` must be `"AssetAdministrationShell"` |
| `AAS_MISSING_GLOBAL_ASSET_ID` | ERROR | `assetInformation.globalAssetId` is required |
| `AAS_NO_SUBMODELS` | ERROR | `submodels` array must contain ≥1 element |
| `AAS_MISSING_WORKFLOW_SUBMODEL` | ERROR | A Submodel with `idShort: "WorkflowDefinition"` must exist |
| `AAS_EMPTY_WORKFLOW` | ERROR | `WorkflowDefinition` must contain ≥1 SMC |
| `AAS_NODE_MISSING_FIELDS` | ERROR | Each node SMC must carry `nodeCategory`, `nodeTypeId`, `label` |
| `AAS_INVALID_CATEGORY` | ERROR | `nodeCategory` must be one of: `TRIGGER`, `AUTOMATIC`, `MANUAL`, `GATEWAY` |
| `AAS_NO_START_NODE` | WARNING | No TRIGGER or MANUAL node found - the flow may have no entry point |

---

## 5. Common errors

| Error | Cause | Fix |
|---|---|---|
| `AAS_INVALID_ROOT` | Root is a Submodel, not a Shell | Wrap the Submodel inside an AAS Shell |
| `AAS_MISSING_GLOBAL_ASSET_ID` | `assetInformation` missing | Add an `assetInformation` block with `globalAssetId` |
| `AAS_MISSING_WORKFLOW_SUBMODEL` | Submodel has the wrong `idShort` | The name **must** be exactly `"WorkflowDefinition"` |
| `AAS_INVALID_CATEGORY` | Value like `"automatic"` (lowercase) | Values are case-sensitive: `AUTOMATIC`, not `automatic` |
| Edges not imported | `AnnotatedRelationship` placed outside the Submodel | Put edges **inside** `WorkflowDefinition.submodelElements` |

---

## 6. Iteration (Instance) shell - IDTA standard submodels

The sections above describe the **Type** shell (`StateMachine` → `WorkflowDefinition`). The iteration page exports an **Instance** shell. It bundles, inline, the IDTA standard submodels below plus two DT-custom ones. The `semanticId` of each root submodel is the value the consortium agreed to align with.

| Submodel | IDTA template | Root `semanticId` | Source data |
|---|---|---|---|
| **TechnicalData** | IDTA 02003 v2.0 | ECLASS IRDI `0173-1#01-AHX837#002` | iteration metadata + node outputs |
| **HandoverDocumentation** | IDTA 02004 v2.0 | ECLASS IRDI `0173-1#01-AHF578#003` | released documents (ply book, release letters) |
| **Digital Nameplate** | IDTA 02006 v3.0 | `https://admin-shell.io/idta/nameplate/3/0/Nameplate` | the iteration's attached **Product** (see below) |
| **ProvenanceLog** | - (platform custom) | `urn:digital-thread:submodel:ProvenanceLog:1:0` | W3C PROV-O lineage |
| **WorkflowExecution** | - (platform custom) | `urn:digital-thread:submodel:WorkflowExecution:1:0` | per-node runtime state |

### 6.1 Digital Nameplate for the attached Product

When the iteration has an attached **Product** (see the Product registry), the shell emits a Digital Nameplate (IDTA 02006 v3.0) describing it. Fields are keyed to ECLASS / IEC-CDD IRDIs:

| Nameplate element | Source |
|---|---|
| `URIOfTheProduct` | `Product.urn` |
| `ManufacturerName` | owning partner's display name |
| `ManufacturerProductDesignation` | `Product.name` |
| `AddressInformation.NationalCode` | owning partner's ISO 3166-1 alpha-2 `country` |

### 6.2 The two custom submodels are custom on purpose

`ProvenanceLog` and `WorkflowExecution` are **custom platform submodels** with Digital-Thread-native `semanticId`s, by design:

- **ProvenanceLog** - there is **no IDTA standard** for W3C PROV-O lineage, so the DT defines its own. (The IDTA working group has a *draft* ProvenanceLog template; the DT will align if/when it is published.)
- **WorkflowExecution** - captures per-node runtime state of an iteration. It tracks toward the **in-development IDTA 02100 "Manufacturing Work Description"** but no published standard yet covers workflow execution state, so it remains custom for now.

AutomationML is **not** offered for iterations: CAEX describes static engineering structure, not workflow runtime state.
