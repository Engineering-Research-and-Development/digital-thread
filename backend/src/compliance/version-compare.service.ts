import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

type JsonPathValue = { path: string; left: any; right: any }

/**
 * VersionCompareService — side-by-side semantic compare.
 *
 * Produces a semantic diff between two StateMachine revisions or two
 * Iterations. The diff walks `nodesJson` / `edgesJson` / metadata and
 * reports added / removed / changed entries with JSON-path pointers.
 */
@Injectable()
export class VersionCompareService {
  constructor(private prisma: PrismaService) {}

  async compareStateMachines(leftId: string, rightId: string) {
    const [a, b] = await Promise.all([
      this.prisma.stateMachine.findUnique({ where: { id: leftId } }),
      this.prisma.stateMachine.findUnique({ where: { id: rightId } }),
    ])
    if (!a || !b) throw new NotFoundException('One or both state machines not found')
    return {
      left: { id: a.id, name: a.name, version: a.version },
      right: { id: b.id, name: b.name, version: b.version },
      nodes: this.diffCollection(
        JSON.parse(a.nodesJson || '[]'), JSON.parse(b.nodesJson || '[]'), 'id',
      ),
      edges: this.diffCollection(
        JSON.parse(a.edgesJson || '[]'), JSON.parse(b.edgesJson || '[]'),
        (e: any) => `${e.source}->${e.target}`,
      ),
    }
  }

  /**
   * Compare two immutable StateMachineVersion rows of the SAME state
   * machine. Identical diff shape as compareStateMachines so the UI can
   * render both with the same component.
   */
  async compareStateMachineVersions(machineId: string, leftVersion: number, rightVersion: number) {
    const [machine, a, b] = await Promise.all([
      this.prisma.stateMachine.findUnique({ where: { id: machineId } }),
      this.prisma.stateMachineVersion.findUnique({
        where: { stateMachineId_versionNumber: { stateMachineId: machineId, versionNumber: leftVersion } },
      }),
      this.prisma.stateMachineVersion.findUnique({
        where: { stateMachineId_versionNumber: { stateMachineId: machineId, versionNumber: rightVersion } },
      }),
    ])
    if (!machine) throw new NotFoundException(`State machine ${machineId} not found`)
    if (!a) throw new NotFoundException(`Version ${leftVersion} not found for ${machineId}`)
    if (!b) throw new NotFoundException(`Version ${rightVersion} not found for ${machineId}`)
    return {
      machine: { id: machine.id, name: machine.name },
      left: { versionNumber: a.versionNumber, versionLabel: a.versionLabel, createdAt: a.createdAt },
      right: { versionNumber: b.versionNumber, versionLabel: b.versionLabel, createdAt: b.createdAt },
      nodes: this.diffCollection(
        JSON.parse(a.nodesJson || '[]'), JSON.parse(b.nodesJson || '[]'), 'id',
      ),
      edges: this.diffCollection(
        JSON.parse(a.edgesJson || '[]'), JSON.parse(b.edgesJson || '[]'),
        (e: any) => `${e.source}->${e.target}`,
      ),
    }
  }

  async compareIterations(leftId: string, rightId: string) {
    const [a, b] = await Promise.all([
      this.prisma.iteration.findUnique({ where: { id: leftId }, include: { nodeStates: true, fileRecords: true } }),
      this.prisma.iteration.findUnique({ where: { id: rightId }, include: { nodeStates: true, fileRecords: true } }),
    ])
    if (!a || !b) throw new NotFoundException('One or both iterations not found')
    const statusByNode = (x: any) => Object.fromEntries(x.nodeStates.map((n: any) => [n.nodeId, { status: n.status, outputFilePath: n.outputFilePath }]))
    return {
      left: { id: a.id, displayId: a.displayId, metadata: JSON.parse(a.metadataJson || '{}') },
      right: { id: b.id, displayId: b.displayId, metadata: JSON.parse(b.metadataJson || '{}') },
      metadataDiff: this.diffObject(JSON.parse(a.metadataJson || '{}'), JSON.parse(b.metadataJson || '{}')),
      nodeStatusDiff: this.diffObject(statusByNode(a), statusByNode(b)),
      fileCountDelta: b.fileRecords.length - a.fileRecords.length,
    }
  }

  private diffCollection<T>(left: T[], right: T[], keyFn: string | ((t: T) => string)) {
    const getKey = typeof keyFn === 'string' ? (t: any) => t[keyFn] : keyFn
    const leftMap = new Map(left.map((x) => [getKey(x), x]))
    const rightMap = new Map(right.map((x) => [getKey(x), x]))
    const added: T[] = []
    const removed: T[] = []
    const changed: Array<{ key: string; diffs: JsonPathValue[] }> = []
    for (const [k, r] of rightMap) {
      if (!leftMap.has(k)) { added.push(r); continue }
      const diffs = this.diffObject(leftMap.get(k), r)
      if (diffs.length) changed.push({ key: String(k), diffs })
    }
    for (const [k, l] of leftMap) {
      if (!rightMap.has(k)) removed.push(l)
    }
    return { added, removed, changed }
  }

  private diffObject(left: any, right: any, pathPrefix = '$'): JsonPathValue[] {
    const out: JsonPathValue[] = []
    const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])
    for (const k of keys) {
      const l = left?.[k]; const r = right?.[k]
      const path = `${pathPrefix}.${k}`
      const bothObj = l && r && typeof l === 'object' && typeof r === 'object' && !Array.isArray(l) && !Array.isArray(r)
      if (bothObj) { out.push(...this.diffObject(l, r, path)); continue }
      if (JSON.stringify(l) !== JSON.stringify(r)) out.push({ path, left: l, right: r })
    }
    return out
  }
}
