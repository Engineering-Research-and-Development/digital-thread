import { Injectable } from '@nestjs/common'
import { NODE_CATALOG } from '@/standards/node-catalog.data'
import { normalizeFlowNode } from '@/iterations/normalize-node'
import type { FlowNodeDef, NodeInputDef, NodeOutputDef } from '@/iterations/types/flow-node'

/**
 * DTDL v3 exporter for state machines and node catalogs.
 *
 * DTDL v3 has no native `File` type, so file I/O is represented as:
 *   - one `Component` per input/output slot of a node,
 *   - the slot schema is a generic FileSlot Interface with two Properties:
 *       * `uri`     (string)  — URI of the bound file (filled at runtime),
 *       * `accepts` (string)  — JSON array of accepted file extensions.
 * This is standard-compliant DTDL v3 — every parser can consume it — and keeps
 * us free of Azure-specific extensions (DTDL-Files).
 */
@Injectable()
export class DtdlExporterService {
  machineToDtdl(machine: any): object[] {
    const rawNodes = typeof machine.nodesJson === 'string' ? JSON.parse(machine.nodesJson) : machine.nodes ?? []
    const edges = typeof machine.edgesJson === 'string' ? JSON.parse(machine.edgesJson) : machine.edges ?? []

    const nodes: FlowNodeDef[] = rawNodes.map((n: any) => normalizeFlowNode(n))
    const fileSlotInterface = this.buildFileSlotInterface()
    const nodeInterfaces = nodes.map((n) => this.nodeToInterface(n, machine.dtmiBase))
    const workflowInterface = this.buildWorkflowInterface(machine, nodes, edges)

    return [workflowInterface, fileSlotInterface, ...nodeInterfaces]
  }

  /**
   * Returns the stable DTMI base for a machine. Preference order:
   *   1. `machine.dtmiBase` (persisted) — guarantees idempotent round-trip.
   *   2. Deterministic fallback from machine id (used when `dtmiBase` is null).
   */
  private baseFor(machine: any): string {
    if (machine.dtmiBase) return machine.dtmiBase.replace(/;?\d+$/, '')
    return `dtmi:digitalthread:workflow:${(machine.id ?? '').replace(/-/g, '')}`
  }

  /** A reusable Interface describing a single file slot (input or output). */
  private buildFileSlotInterface(): object {
    return {
      '@context': 'dtmi:dtdl:context;3',
      '@id': 'dtmi:digitalthread:dt:FileSlot;1',
      '@type': 'Interface',
      displayName: 'File slot',
      description: 'A node-level input/output port carrying a file reference and an accepted-extension whitelist.',
      contents: [
        { '@type': 'Property', name: 'uri', schema: 'string', writable: true },
        { '@type': 'Property', name: 'accepts', schema: 'string', writable: false,
          description: 'JSON array of accepted file extensions (e.g. ["\\.step","\\.iges"]).',
        },
        { '@type': 'Property', name: 'cardinality', schema: 'string', writable: false,
          description: 'ONE or MANY.',
        },
        { '@type': 'Property', name: 'required', schema: 'boolean', writable: false },
        { '@type': 'Property', name: 'sourceKind', schema: 'string', writable: false,
          description: 'MANUAL | PREDECESSOR | DATASOURCE — only meaningful for inputs.',
        },
      ],
    }
  }

  private buildWorkflowInterface(machine: any, nodes: FlowNodeDef[], edges: any[]): object {
    const base = this.baseFor(machine)
    const components = nodes.map((n) => ({
      '@type': 'Component',
      name: n.id.replace(/-/g, '_'),
      displayName: n.name ?? n.label ?? n.id,
      schema: this.nodeInterfaceId(n),
    }))

    return {
      '@context': 'dtmi:dtdl:context;3',
      '@id': `${base};${this.versionSuffix(machine.version)}`,
      '@type': 'Interface',
      displayName: machine.name,
      description: machine.description ?? '',
      contents: [
        ...components,
        {
          '@type': 'Relationship',
          name: 'flowsTo',
          displayName: 'Flows To',
          properties: [
            { '@type': 'Property', name: 'sourceId', schema: 'string' },
            { '@type': 'Property', name: 'targetId', schema: 'string' },
            { '@type': 'Property', name: 'sourceOutputId', schema: 'string' },
            { '@type': 'Property', name: 'targetInputId', schema: 'string' },
            { '@type': 'Property', name: 'label', schema: 'string' },
          ],
          // Encode edges as a writable property — DTDL v3 has no native edge list.
        },
        {
          '@type': 'Property', name: 'edgesJson', schema: 'string', writable: true,
          comment: JSON.stringify(edges),
        },
      ],
    }
  }

  private nodeInterfaceId(node: FlowNodeDef): string {
    const slug = (node.nodeTypeId ?? node.id).replace(/[^a-zA-Z0-9]/g, '')
    return `dtmi:digitalthread:node:${slug};1`
  }

  private nodeToInterface(node: FlowNodeDef, _base?: string): object {
    const inputs = (node.inputs ?? []).map((inp) => this.ioComponent(inp, 'input'))
    const outputs = (node.outputs ?? []).map((out) => this.ioComponent(out, 'output'))
    return {
      '@context': 'dtmi:dtdl:context;3',
      '@id': this.nodeInterfaceId(node),
      '@type': 'Interface',
      displayName: node.name ?? node.label ?? node.id,
      description: node.description ?? '',
      contents: [
        { '@type': 'Property', name: 'kind', schema: 'string', writable: false,
          comment: node.kind ?? 'TASK',
        },
        { '@type': 'Property', name: 'name', schema: 'string', writable: false },
        { '@type': 'Property', name: 'tags', schema: 'string', writable: false,
          comment: JSON.stringify(node.tags ?? []),
        },
        { '@type': 'Property', name: 'responsiblePartnerId', schema: 'string', writable: false },
        // Full multi-partner list (JSON array in comment); responsiblePartnerId stays the primary.
        { '@type': 'Property', name: 'responsiblePartnerIds', schema: 'string', writable: false,
          comment: JSON.stringify(node.responsiblePartnerIds ?? []),
        },
        ...(node.gateway
          ? [{ '@type': 'Property', name: 'gatewayLogic', schema: 'string', writable: false,
              comment: node.gateway.logic,
            }]
          : []),
        ...inputs,
        ...outputs,
        { '@type': 'Telemetry', name: 'status', schema: {
          '@type': 'Enum', valueSchema: 'string',
          enumValues: ['IDLE','PENDING','RUNNING','COMPLETED','ERROR','SKIPPED'].map((v) => ({ name: v, enumValue: v })),
        }},
        { '@type': 'Telemetry', name: 'progress', schema: 'double' },
      ],
    }
  }

  private ioComponent(slot: NodeInputDef | NodeOutputDef, role: 'input' | 'output'): object {
    const name = `${role}_${slot.id}`.replace(/[^a-zA-Z0-9_]/g, '_')
    const sourceKind = (slot as NodeInputDef).source?.kind ?? null
    return {
      '@type': 'Component',
      name,
      displayName: slot.name ?? (slot as any).label ?? slot.id,
      description: slot.description ?? '',
      schema: 'dtmi:digitalthread:dt:FileSlot;1',
      comment: JSON.stringify({
        slotId: slot.id,
        role,
        cardinality: slot.cardinality,
        required: slot.required,
        accepts: slot.fileTypes,
        ...(sourceKind ? { sourceKind } : {}),
      }),
    }
  }

  private versionSuffix(version?: string): string {
    // DTDL version is a single non-negative integer. Use the first numeric
    // segment of semver; default 1.
    if (!version) return '1'
    const n = parseInt(version.split('.')[0] ?? '1', 10)
    return Number.isFinite(n) && n > 0 ? String(n) : '1'
  }

  /**
   * Emit a DTDL **twin instance** for an iteration. Since DTDL v3 does not
   * formally reify Type vs Instance (Interfaces are the type, the twin lives
   * in the runtime), we follow the Azure Digital Twins JSON convention: a
   * top-level object with `$dtId`, `$metadata.$model` referencing the
   * workflow Interface, and per-component twins (one per node) carrying the
   * runtime state.
   *
   * The returned document also embeds the model definitions in `models[]`
   * so the file is self-describing — useful for handover without an ADT.
   */
  machineIterationToDtdlTwin(machine: any, iter: any, nodeStates: any[]): object {
    const rawNodes = typeof machine.nodesJson === 'string' ? JSON.parse(machine.nodesJson) : machine.nodes ?? []
    const nodes: FlowNodeDef[] = rawNodes.map((n: any) => normalizeFlowNode(n))
    const base = this.baseFor(machine)
    const workflowModelId = `${base};${this.versionSuffix(machine.version)}`
    const stateByNode = new Map<string, any>(nodeStates.map((s: any) => [s.nodeId, s]))

    const componentTwins: Record<string, any> = {}
    for (const n of nodes) {
      const s = stateByNode.get(n.id)
      componentTwins[n.id.replace(/-/g, '_')] = {
        $metadata: {},
        kind: n.kind ?? 'TASK',
        name: n.name ?? n.label ?? n.id,
        status: s?.status ?? 'IDLE',
        progress: typeof s?.progress === 'number' ? s.progress : 0,
        startedAt: s?.startedAt?.toISOString?.() ?? null,
        completedAt: s?.completedAt?.toISOString?.() ?? null,
        outputFilePath: s?.outputFilePath ?? null,
        outputsJson: s?.outputsJson ?? '{}',
      }
    }

    const twin = {
      $dtId: `iter:${iter.id}`,
      $metadata: { $model: workflowModelId },
      displayId: iter.displayId,
      machineId: iter.machineId,
      machineName: iter.machineName,
      iterationStatus: iter.status,
      createdAt: iter.createdAt?.toISOString?.() ?? null,
      completedAt: iter.completedAt?.toISOString?.() ?? null,
      classification: iter.classification ?? 'INTERNAL',
      ...componentTwins,
    }

    return {
      $schema: 'https://digitaltwins.azure.com/twins.schema.json',
      // Convenience: ship the type definitions alongside the instance so the
      // file is self-contained for hand-off.
      models: this.machineToDtdl(machine),
      twins: [twin],
    }
  }

  /**
   * Legacy entry-point: emits one DTDL Interface per entry in the (now
   * deprecated) NODE_CATALOG. The generic node model retired this catalog
   * from the runtime, but the export is kept for tooling that hasn't
   * migrated yet.
   */
  nodeCatalogToDtdl(): object[] {
    return NODE_CATALOG.map((entry) => ({
      '@context': 'dtmi:dtdl:context;3',
      '@id': `dtmi:digitalthread:node:${entry.nodeTypeId.replace(/_/g, '')};1`,
      '@type': 'Interface',
      displayName: entry.label,
      description: entry.description ?? '',
      contents: [
        { '@type': 'Property', name: 'category', schema: 'string', writable: false, displayName: entry.category },
        { '@type': 'Property', name: 'nodeTypeId', schema: 'string', writable: false },
        { '@type': 'Property', name: 'label', schema: 'string', writable: false },
        { '@type': 'Property', name: 'color', schema: 'string', writable: false },
        { '@type': 'Property', name: 'defaultPartner', schema: 'string' },
        { '@type': 'Property', name: 'expectedOutput', schema: 'string' },
        { '@type': 'Telemetry', name: 'status', schema: {
          '@type': 'Enum', valueSchema: 'string',
          enumValues: ['IDLE','PENDING','RUNNING','COMPLETED','ERROR','SKIPPED'].map((v) => ({ name: v, enumValue: v })),
        }},
        { '@type': 'Telemetry', name: 'progress', schema: 'double' },
      ],
    }))
  }
}
