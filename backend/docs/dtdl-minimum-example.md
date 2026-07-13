# DTDL v3 — Minimum Example for Digital Thread Import

**Standard:** Digital Twins Definition Language v3 (Microsoft / Azure IoT / DTDL spec)
**Serialisation:** JSON-LD array

---

## 1. Core concepts — DTDL ↔ Digital Thread mapping

| DTDL element | Digital Thread |
|---|---|
| `Interface` (workflow root) | `StateMachine` |
| `Component` (inside the workflow Interface) | `FlowNodeDef` — single step |
| `Interface` referenced by a Component | Node type (with `kind`) |
| `Component` with schema `dtmi:digitalthread:dt:FileSlot;1` | `NodeInputDef` / `NodeOutputDef` — file slot |
| `Relationship` with `name: "flowsTo"` + `properties: { sourceOutputId, targetInputId }` | `FlowEdgeDef` — explicit connection between output and input |
| `Property name: "kind"` on the Interface | `FlowNodeDef.kind` (TRIGGER/TASK/GATEWAY) |
| `Property name: "accepts"` on a FileSlot | `fileTypes` whitelist for inputs/outputs |
| `Telemetry name: "status"` | `NodeRuntimeState.status` |
| `Telemetry name: "progress"` | `NodeRuntimeState.progress` (0.0–1.0) |

---

## 2. Minimum required elements

### Document structure

The document must be a **JSON array** of Interface definitions:

```json
[
  { /* Workflow Interface — describes the complete graph */ },
  { /* Node Interface 1 */ },
  { /* Node Interface 2 */ },
  ...
]
```

### Workflow Interface (root)

| Field | Type | Required | Notes |
|---|---|---|---|
| `@context` | `"dtmi:dtdl:context;3"` | ✅ | Or `context;2` |
| `@id` | `dtmi:...:workflow:...; N` | ✅ | DTDL ID format |
| `@type` | `"Interface"` | ✅ | |
| `displayName` | string | ✅ | Workflow name |
| `contents[*Component]` | array | ✅ (≥1) | One Component per node |
| `contents[*Relationship]` with `name:"flowsTo"` | 1 | ✅ | Edge relationship |

### Component (one per node)

| Field | Type | Required |
|---|---|---|
| `@type` | `"Component"` | ✅ |
| `name` | string (no spaces) | ✅ |
| `schema` | `@id` of the Interface describing the type | ✅ |

### Node Interface (one per node type)

| Field | Type | Required |
|---|---|---|
| `@context` | `"dtmi:dtdl:context;3"` | ✅ |
| `@id` | DTDL URI | ✅ |
| `@type` | `"Interface"` | ✅ |
| `contents[*Property]` with `name:"category"` | 1 | ✅ | Value: `MANUAL`, `AUTOMATIC`, etc. |
| `contents[*Property]` with `name:"nodeTypeId"` | 1 | Recommended | |
| `contents[*Property]` with `name:"responsiblePartner"` | 1 | — | Comma-separated partner codes — the exporter emits the full `responsiblePartnerIds` list (a node may be shared by several partners). |

---

## 3. Annotated complete example

```json
[
  {
    "@context": "dtmi:dtdl:context;3",
    "@id": "dtmi:digitalthread:workflow:CompositePanelWorkflow;1",
    "@type": "Interface",
    "displayName": "Composite Panel Workflow",
    "description": "Manufacturing and inspection workflow for composite panel",

    "contents": [

      {
        "@type": "Component",
        "name": "cad_release",
        "displayName": "CAD Design Release",
        "schema": "dtmi:digitalthread:node:CadRelease;1"
      },

      {
        "@type": "Component",
        "name": "fea_analysis",
        "displayName": "FEA Structural Analysis",
        "schema": "dtmi:digitalthread:node:FeaStructural;1"
      },

      {
        "@type": "Relationship",
        "name": "flowsTo",
        "displayName": "Flows To",
        "properties": [
          { "@type": "Property", "name": "sourceId", "schema": "string" },
          { "@type": "Property", "name": "targetId", "schema": "string" },
          { "@type": "Property", "name": "label",    "schema": "string" }
        ]
      },

      {
        "@type": "Property",
        "name": "edgesJson",
        "schema": "string",
        "writable": true,
        "comment": "[{\"id\":\"e1\",\"source\":\"cad_release\",\"target\":\"fea_analysis\"}]"
      }

    ]
  },

  {
    "@context": "dtmi:dtdl:context;3",
    "@id": "dtmi:digitalthread:node:CadRelease;1",
    "@type": "Interface",
    "displayName": "CAD Release",
    "description": "Upload final STEP/CATPART design file",

    "contents": [
      { "@type": "Property", "name": "category",          "schema": "string", "writable": false },
      { "@type": "Property", "name": "nodeTypeId",        "schema": "string", "writable": false },
      { "@type": "Property", "name": "label",             "schema": "string", "writable": false },
      { "@type": "Property", "name": "responsiblePartner","schema": "string" },
      {
        "@type": "Telemetry",
        "name": "status",
        "schema": {
          "@type": "Enum",
          "valueSchema": "string",
          "enumValues": [
            { "name": "IDLE",      "enumValue": "IDLE" },
            { "name": "PENDING",   "enumValue": "PENDING" },
            { "name": "RUNNING",   "enumValue": "RUNNING" },
            { "name": "COMPLETED", "enumValue": "COMPLETED" },
            { "name": "ERROR",     "enumValue": "ERROR" }
          ]
        }
      },
      { "@type": "Telemetry", "name": "progress", "schema": "double" }
    ]
  },

  {
    "@context": "dtmi:dtdl:context;3",
    "@id": "dtmi:digitalthread:node:FeaStructural;1",
    "@type": "Interface",
    "displayName": "FEA Structural Analysis",
    "description": "Finite Element Analysis — AUTOMATIC execution",

    "contents": [
      { "@type": "Property", "name": "category",   "schema": "string", "writable": false },
      { "@type": "Property", "name": "nodeTypeId", "schema": "string", "writable": false },
      { "@type": "Property", "name": "label",      "schema": "string", "writable": false },
      {
        "@type": "Command",
        "name": "execute",
        "request":  { "name": "inputsJson", "schema": "string" },
        "response": { "name": "outputPath", "schema": "string" }
      },
      { "@type": "Telemetry", "name": "status",   "schema": "string" },
      { "@type": "Telemetry", "name": "progress", "schema": "double" }
    ]
  }

]
```

---

## 4. How edges are encoded

DTDL v3 has no native concept of a "link list" — we use a `Property` named `edgesJson` on the workflow Interface and carry the serialised edge array in its `comment` field:

```json
{
  "@type": "Property",
  "name": "edgesJson",
  "schema": "string",
  "comment": "[{\"id\":\"e1\",\"source\":\"cad_release\",\"target\":\"fea_analysis\",\"label\":\"Approved\"}]"
}
```

The importer reads the `comment` field and deserialises it as an array of `FlowEdgeDef`.

---

## 5. Validation rules

| Code | Level | Rule |
|---|---|---|
| `DTDL_INVALID_JSON` | ERROR | Input must be a JSON array or object |
| `DTDL_MISSING_CONTEXT` | ERROR | At least one element must carry `@context` containing `"dtdl"` |
| `DTDL_NO_INTERFACE` | ERROR | No Interface (`@type: "Interface"`) found |
| `DTDL_NO_COMPONENTS` | ERROR | No Interface with both Component and Relationship "flowsTo" |
| `DTDL_NO_EDGES` | ERROR | No Relationship with `name: "flowsTo"` |
| `DTDL_BROKEN_SCHEMA_REF` | ERROR | A Component.schema references an Interface that is not present in the document |
| `DTDL_NODE_MISSING_CATEGORY` | ERROR | An Interface referenced by a Component has no `category` Property |

---

## 6. Common errors

| Error | Cause | Fix |
|---|---|---|
| `DTDL_MISSING_CONTEXT` | Document is a single object, not an array | Wrap it in `[...]` |
| `DTDL_BROKEN_SCHEMA_REF` | Component.schema points to an ID not in the document | Add the missing Interface or correct the ID |
| `DTDL_NODE_MISSING_CATEGORY` | Node Interface has no `category` property | Add `{ "@type": "Property", "name": "category", "schema": "string" }` |
| Edges not imported | JSON in the edge list is syntactically wrong | Validate the JSON inside the `comment` field of the `edgesJson` property |
| Invalid ID | `@id` does not follow the `dtmi:org:name;version` format | Use the form `dtmi:myorg:something:Name;1` |
