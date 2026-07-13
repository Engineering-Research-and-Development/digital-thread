# AutomationML (CAEX) — Minimum Example for Digital Thread Import

**Standard:** IEC 62714 — AutomationML (CAEX 3.0)
**File format:** `.aml` (XML)
**Endpoint:** `POST /api/v1/aml/import` · `POST /api/v1/aml/validate`

---

## 1. Core concepts — AML ↔ Digital Thread mapping

| AutomationML element | Digital Thread |
|---|---|
| `CAEXFile` root | Document container |
| `SystemUnitClassLib` | Node-type definitions (templates) → `StateMachine.nodes` |
| `SystemUnitClass` | `FlowNodeDef` — single step of the generic node model |
| `RoleRequirements.RefBaseRoleClassPath` | `FlowNodeDef.kind` (TRIGGER/TASK/GATEWAY) |
| `Attribute[Name=kind]` | `FlowNodeDef.kind` |
| `Attribute[Name=name]` | `FlowNodeDef.name` (visible on the canvas) |
| `Attribute[Name=responsiblePartnerIds]` | `FlowNodeDef.responsiblePartnerIds[]` (canonical; comma-separated list — a node may be shared by several partners) |
| `Attribute[Name=responsiblePartnerId]` | Legacy single partner id (mirrors `responsiblePartnerIds[0]`) |
| `Attribute[Name=responsiblePartner]` | Legacy partner name |
| `ExternalInterface` (RefBaseClass=FileInput) with `Attribute[fileTypes]` + `Attribute[source]` | `NodeInputDef` with whitelist and explicit binding |
| `ExternalInterface` (RefBaseClass=FileOutput) with `Attribute[fileTypes]` | `NodeOutputDef` (declared slot) |
| `ExternalInterface` (RefBaseClass=FileOutput) | `NodeConfig.outputs[]` |
| `InstanceHierarchy` | Canvas layout and node positions |
| `InternalElement` inside InstanceHierarchy | Node instance with position |
| `InternalLink` | `FlowEdgeDef` — connection between nodes |
| `RoleClassLib "DigitalThreadRoles"` | Catalogue of the 5 node categories |

---

## 2. Minimum required elements

### Root `CAEXFile`

| Attribute | Required | Recommended value |
|---|---|---|
| `SchemaVersion` | ✅ | `"3.0"` |
| `FileName` | Recommended | `"my-workflow.aml"` |

### `RoleClassLib "DigitalThreadRoles"`

Must be present and contain the 5 RoleClasses that Digital Thread recognises:

```xml
<RoleClassLib Name="DigitalThreadRoles">
  <RoleClass Name="TRIGGER"/>
  <RoleClass Name="AUTOMATIC"/>
  <RoleClass Name="MANUAL"/>
  <RoleClass Name="GATEWAY"/>
  <RoleClass Name="STORAGE"/>
</RoleClassLib>
```

### Each `SystemUnitClass`

| Element/Attribute | Required | Note |
|---|---|---|
| `@Name` | ✅ | Used as nodeId when `nodeTypeId` is absent |
| `RoleRequirements[@RefBaseRoleClassPath]` | ✅ | Format: `DigitalThreadRoles/{CATEGORY}` |
| `Attribute[@Name="nodeTypeId"]` | Recommended | If absent, `@Name` is used as nodeTypeId |
| `Attribute[@Name="label"]` | Recommended | Label visible in the frontend |
| `Attribute[@Name="responsiblePartner"]` | — | e.g. `"CAI"` |

---

## 3. Annotated complete example

```xml
<?xml version="1.0" encoding="utf-8"?>
<CAEXFile SchemaVersion="3.0" FileName="composite-panel-workflow.aml">

  <!-- ================================================================
       REQUIRED LIBRARIES — Role and interface definitions
       ================================================================ -->
  <RoleClassLib Name="DigitalThreadRoles">
    <RoleClass Name="TRIGGER">   <Description>Event-driven entry point</Description></RoleClass>
    <RoleClass Name="AUTOMATIC"> <Description>Automated computational step</Description></RoleClass>
    <RoleClass Name="MANUAL">    <Description>Human-executed activity</Description></RoleClass>
    <RoleClass Name="GATEWAY">   <Description>Flow control gate AND/OR/XOR</Description></RoleClass>
    <RoleClass Name="STORAGE">   <Description>Data persistence and export</Description></RoleClass>
  </RoleClassLib>

  <InterfaceClassLib Name="DigitalThreadInterfaces">
    <InterfaceClass Name="FileInput">  <Description>File input port for a workflow node</Description></InterfaceClass>
    <InterfaceClass Name="FileOutput"> <Description>File output port for a workflow node</Description></InterfaceClass>
  </InterfaceClassLib>

  <!-- ================================================================
       NODE TYPES — Structure of each step
       ================================================================ -->
  <SystemUnitClassLib Name="CompositePanelWorkflowNodes">

    <!-- ── Node 1: MANUAL ── -->
    <SystemUnitClass Name="cad-release">
      <!-- REQUIRED: role that defines the category -->
      <RoleRequirements RefBaseRoleClassPath="DigitalThreadRoles/MANUAL"/>

      <!-- RECOMMENDED: base attributes -->
      <Attribute Name="nodeTypeId"          AttributeDataType="xs:string" Value="CAD_RELEASE"/>
      <Attribute Name="label"               AttributeDataType="xs:string" Value="CAD Design Release"/>
      <Attribute Name="description"         AttributeDataType="xs:string" Value="Upload final STEP/CATPART file"/>
      <Attribute Name="responsiblePartner"  AttributeDataType="xs:string" Value="Design Authority"/>

      <!-- OPTIONAL: input/output ports -->
      <ExternalInterface Name="cad-file" RefBaseClassPath="DigitalThreadInterfaces/FileInput">
        <Attribute Name="label"     AttributeDataType="xs:string"  Value="CAD File"/>
        <Attribute Name="source"    AttributeDataType="xs:string"  Value="MANUAL"/>
        <Attribute Name="required"  AttributeDataType="xs:boolean" Value="true"/>
        <Attribute Name="fileTypes" AttributeDataType="xs:string"  Value="[&quot;.step&quot;,&quot;.catpart&quot;]"/>
      </ExternalInterface>

      <ExternalInterface Name="cad-out" RefBaseClassPath="DigitalThreadInterfaces/FileOutput">
        <Attribute Name="label"     AttributeDataType="xs:string" Value="Released CAD"/>
        <Attribute Name="fileTypes" AttributeDataType="xs:string" Value="[&quot;.step&quot;]"/>
      </ExternalInterface>
    </SystemUnitClass>

    <!-- ── Node 2: AUTOMATIC ── -->
    <SystemUnitClass Name="fea-analysis">
      <RoleRequirements RefBaseRoleClassPath="DigitalThreadRoles/AUTOMATIC"/>
      <Attribute Name="nodeTypeId"   AttributeDataType="xs:string" Value="FEA_STRUCTURAL"/>
      <Attribute Name="label"        AttributeDataType="xs:string" Value="FEA Structural Analysis"/>
      <Attribute Name="description"  AttributeDataType="xs:string" Value="Finite Element Analysis under design loads"/>
      <Attribute Name="responsiblePartner" AttributeDataType="xs:string" Value="Simulation Lab"/>

      <ExternalInterface Name="cad-input" RefBaseClassPath="DigitalThreadInterfaces/FileInput">
        <Attribute Name="label"     AttributeDataType="xs:string"  Value="CAD Model"/>
        <Attribute Name="source"    AttributeDataType="xs:string"  Value="PREDECESSOR"/>
        <Attribute Name="required"  AttributeDataType="xs:boolean" Value="true"/>
        <Attribute Name="fileTypes" AttributeDataType="xs:string"  Value="[&quot;.step&quot;]"/>
      </ExternalInterface>

      <ExternalInterface Name="fea-results" RefBaseClassPath="DigitalThreadInterfaces/FileOutput">
        <Attribute Name="label"     AttributeDataType="xs:string" Value="FEA Results"/>
        <Attribute Name="fileTypes" AttributeDataType="xs:string" Value="[&quot;.h5&quot;,&quot;.csv&quot;]"/>
      </ExternalInterface>
    </SystemUnitClass>

    <!-- ── Node 3: GATEWAY ── -->
    <SystemUnitClass Name="acceptance-gate">
      <RoleRequirements RefBaseRoleClassPath="DigitalThreadRoles/GATEWAY"/>
      <Attribute Name="nodeTypeId" AttributeDataType="xs:string" Value="QUALITY_GATE"/>
      <Attribute Name="label"      AttributeDataType="xs:string" Value="FEA Acceptance Gate"/>
      <Attribute Name="gateType"   AttributeDataType="xs:string" Value="AND"/>
    </SystemUnitClass>

    <!-- ── Node 4: STORAGE ── -->
    <SystemUnitClass Name="aas-update">
      <RoleRequirements RefBaseRoleClassPath="DigitalThreadRoles/STORAGE"/>
      <Attribute Name="nodeTypeId" AttributeDataType="xs:string" Value="AAS_UPDATE"/>
      <Attribute Name="label"      AttributeDataType="xs:string" Value="AAS Knowledge Base Update"/>
    </SystemUnitClass>

  </SystemUnitClassLib>

  <!-- ================================================================
       WORKFLOW GRAPH — Layout and connections
       ================================================================ -->
  <InstanceHierarchy Name="CompositePanelWorkflowGraph">

    <InternalElement Name="cad-release" RefBaseSystemUnitPath="CompositePanelWorkflowNodes/cad-release">
      <Attribute Name="positionX" AttributeDataType="xs:float" Value="100"/>
      <Attribute Name="positionY" AttributeDataType="xs:float" Value="200"/>
    </InternalElement>

    <InternalElement Name="fea-analysis" RefBaseSystemUnitPath="CompositePanelWorkflowNodes/fea-analysis">
      <Attribute Name="positionX" AttributeDataType="xs:float" Value="350"/>
      <Attribute Name="positionY" AttributeDataType="xs:float" Value="200"/>
    </InternalElement>

    <InternalElement Name="acceptance-gate" RefBaseSystemUnitPath="CompositePanelWorkflowNodes/acceptance-gate">
      <Attribute Name="positionX" AttributeDataType="xs:float" Value="600"/>
      <Attribute Name="positionY" AttributeDataType="xs:float" Value="200"/>
    </InternalElement>

    <InternalElement Name="aas-update" RefBaseSystemUnitPath="CompositePanelWorkflowNodes/aas-update">
      <Attribute Name="positionX" AttributeDataType="xs:float" Value="850"/>
      <Attribute Name="positionY" AttributeDataType="xs:float" Value="200"/>
    </InternalElement>

    <!-- ── EDGES — Connections between nodes ── -->
    <InternalLink Name="e1" RefPartnerSideA="cad-release"   RefPartnerSideB="fea-analysis"/>
    <InternalLink Name="e2" RefPartnerSideA="fea-analysis"  RefPartnerSideB="acceptance-gate"/>
    <InternalLink Name="e3" RefPartnerSideA="acceptance-gate" RefPartnerSideB="aas-update">
      <Attribute Name="label" AttributeDataType="xs:string" Value="FEA Pass"/>
    </InternalLink>

  </InstanceHierarchy>

</CAEXFile>
```

---

## 4. Validation rules

| Code | Level | Rule |
|---|---|---|
| `AML_INVALID_ROOT` | ERROR | Root element must be `<CAEXFile>` |
| `AML_EMPTY_DOCUMENT` | ERROR | Must contain at least a `SystemUnitClassLib` or an `InstanceHierarchy` |
| `AML_MISSING_ROLE` | ERROR | Each `SystemUnitClass` must have a `<RoleRequirements>` |
| `AML_INVALID_ROLE` | ERROR | `RefBaseRoleClassPath` must end with one of the 5 valid values |
| `AML_MISSING_NODE_TYPE` | ERROR | `SystemUnitClass` must have `@Name` or a `nodeTypeId` attribute |
| `AML_MISSING_SCHEMA_VERSION` | WARNING | `SchemaVersion` missing — 3.0 is assumed |

---

## 5. Patterns for input source types

| `source` value | Meaning |
|---|---|
| `MANUAL` | The user uploads the file manually |
| `PREDECESSOR` | File produced by the predecessor node in the graph |
| `DATASOURCE` | Value pulled from an external DataSource (OPC-UA, MQTT, etc.) |

---

## 6. Common errors

| Error | Cause | Fix |
|---|---|---|
| `AML_MISSING_ROLE` | `<RoleRequirements>` missing | Add `<RoleRequirements RefBaseRoleClassPath="DigitalThreadRoles/MANUAL"/>` |
| `AML_INVALID_ROLE` | Path such as `"DigitalThread/Manual"` (wrong case) | Use exactly `DigitalThreadRoles/MANUAL` (uppercase) |
| Edges not imported | `<InternalLink>` not in `<InstanceHierarchy>` | Move the links inside the `<InstanceHierarchy>` block |
| Bad `&quot;` encoding | JSON in fileTypes attributes not escaped | Use `&quot;` for quotes inside XML attribute values |
| Duplicate nodes | Two `SystemUnitClass` with the same `@Name` | Names must be unique within the same lib |
