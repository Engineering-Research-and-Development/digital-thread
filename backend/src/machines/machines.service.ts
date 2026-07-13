import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * Module-level safe JSON-array parse (no `this`, so it stays correct when
 * deserialize is passed unbound as `items.map(this.deserialize)`). Returns [] on
 * malformed JSON so a single corrupt machine row never 500s the whole list.
 */
function safeJsonArray(json: unknown): any[] {
  if (Array.isArray(json)) return json
  if (typeof json !== 'string') return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/**
 * Versioned state machines with *demand-driven* version creation.
 *
 *   - The StateMachine row carries a denormalised "head" copy
 *     (nodesJson/edgesJson + latestVersion) for fast editor reads.
 *   - StateMachineVersion rows are immutable for any version that has at
 *     least one Iteration pinned to it (any status). Editing the parent
 *     never affects running/completed iterations.
 *   - The head version (`latestVersion`) is "draft" while NO iteration
 *     references it; saves edit it in place. The first iteration created
 *     against it locks the version, and the next save bumps to a new
 *     version row — preserving the immutability guarantee for that
 *     iteration's frozen workflow.
 *
 * This avoids version-number sprawl during interactive editing while keeping
 * every iteration's view of the workflow reproducible.
 */
@Injectable()
export class MachinesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns true when the head version of `stateMachineId` is "locked" by at
   * least one iteration. While locked, in-place edits would silently mutate
   * what a running/completed iteration sees as its frozen workflow — so the
   * next save MUST create a new version row instead.
   */
  private async headVersionHasIterations(stateMachineId: string, latestVersion: number): Promise<boolean> {
    const head = await this.prisma.stateMachineVersion.findUnique({
      where: { stateMachineId_versionNumber: { stateMachineId, versionNumber: latestVersion } },
      select: { id: true },
    })
    if (!head) return false
    const pinned = await this.prisma.iteration.count({ where: { stateMachineVersionId: head.id } })
    return pinned > 0
  }

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.prisma.stateMachine.findMany({
        skip, take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { iterations: true } } },
      }),
      this.prisma.stateMachine.count(),
    ])
    return { items: items.map(this.deserialize), total }
  }

  async findOne(id: string) {
    const m = await this.prisma.stateMachine.findUnique({
      where: { id },
      include: { _count: { select: { iterations: true } } },
    })
    if (!m) throw new NotFoundException(`StateMachine ${id} not found`)
    return this.deserialize(m)
  }

  async create(data: any) {
    const { nodes, edges, groups, tags, createdById, version: versionLabel, ...rest } = data
    const nodesJson = JSON.stringify(nodes ?? [])
    const edgesJson = JSON.stringify(edges ?? [])
    const groupsJson = JSON.stringify(groups ?? [])
    // Single transaction: create the head row + initial v1 snapshot.
    const machine = await this.prisma.$transaction(async (tx) => {
      const m = await tx.stateMachine.create({
        data: {
          ...rest,
          version: versionLabel ?? '1.0.0',
          nodesJson,
          edgesJson,
          groupsJson,
          tags: JSON.stringify(tags ?? []),
          latestVersion: 1,
          createdById: createdById ?? null,
        },
      })
      await tx.stateMachineVersion.create({
        data: {
          stateMachineId: m.id,
          versionNumber: 1,
          versionLabel: versionLabel ?? null,
          nodesJson,
          edgesJson,
          groupsJson,
          createdById: createdById ?? null,
        },
      })
      return m
    })
    return this.deserialize(machine)
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.stateMachine.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`StateMachine ${id} not found`)

    const { nodes, edges, groups, tags, createdById, ...rest } = data
    const graphChanged = nodes !== undefined || edges !== undefined || groups !== undefined
    const patch: any = { ...rest, updatedAt: new Date() }
    if (nodes !== undefined) patch.nodesJson = JSON.stringify(nodes)
    if (edges !== undefined) patch.edgesJson = JSON.stringify(edges)
    if (groups !== undefined) patch.groupsJson = JSON.stringify(groups)
    if (tags !== undefined) patch.tags = JSON.stringify(tags)

    // Bump version only when the head version is locked by at least one
    // iteration. Otherwise the head version is a draft and we edit it in place.
    const headIsLocked = graphChanged
      ? await this.headVersionHasIterations(id, existing.latestVersion)
      : false

    const machine = await this.prisma.$transaction(async (tx) => {
      if (graphChanged && headIsLocked) {
        const nextVersion = existing.latestVersion + 1
        patch.latestVersion = nextVersion
        await tx.stateMachineVersion.create({
          data: {
            stateMachineId: id,
            versionNumber: nextVersion,
            versionLabel: typeof patch.version === 'string' ? patch.version : existing.version,
            nodesJson: patch.nodesJson ?? existing.nodesJson,
            edgesJson: patch.edgesJson ?? existing.edgesJson,
            groupsJson: patch.groupsJson ?? existing.groupsJson,
            createdById: createdById ?? null,
          },
        })
      } else if (graphChanged) {
        // Mutate the head version in place — no iterations depend on it yet.
        await tx.stateMachineVersion.update({
          where: { stateMachineId_versionNumber: { stateMachineId: id, versionNumber: existing.latestVersion } },
          data: {
            nodesJson: patch.nodesJson ?? existing.nodesJson,
            edgesJson: patch.edgesJson ?? existing.edgesJson,
            groupsJson: patch.groupsJson ?? existing.groupsJson,
            versionLabel: typeof patch.version === 'string' ? patch.version : existing.version,
          },
        })
      }
      return tx.stateMachine.update({ where: { id }, data: patch })
    })
    return this.deserialize(machine)
  }

  async updateGraph(id: string, nodes: any[], edges: any[], groups?: any[], createdById?: string) {
    const existing = await this.prisma.stateMachine.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`StateMachine ${id} not found`)
    const nodesJson = JSON.stringify(nodes)
    const edgesJson = JSON.stringify(edges)
    // Keep the existing groups when the client omits them.
    const groupsJson = groups !== undefined ? JSON.stringify(groups) : existing.groupsJson

    // Only create a new version when the head version is locked by an
    // iteration; otherwise edit the head version in place.
    const headIsLocked = await this.headVersionHasIterations(id, existing.latestVersion)

    const machine = await this.prisma.$transaction(async (tx) => {
      if (headIsLocked) {
        const nextVersion = existing.latestVersion + 1
        await tx.stateMachineVersion.create({
          data: {
            stateMachineId: id,
            versionNumber: nextVersion,
            versionLabel: existing.version,
            nodesJson,
            edgesJson,
            groupsJson,
            createdById: createdById ?? null,
          },
        })
        return tx.stateMachine.update({
          where: { id },
          data: {
            nodesJson,
            edgesJson,
            groupsJson,
            updatedAt: new Date(),
            latestVersion: nextVersion,
          },
        })
      }
      // In-place edit of the draft head version.
      await tx.stateMachineVersion.update({
        where: { stateMachineId_versionNumber: { stateMachineId: id, versionNumber: existing.latestVersion } },
        data: { nodesJson, edgesJson, groupsJson },
      })
      return tx.stateMachine.update({
        where: { id },
        data: { nodesJson, edgesJson, groupsJson, updatedAt: new Date() },
      })
    })
    return this.deserialize(machine)
  }

  async remove(id: string) {
    await this.findOne(id)
    await this.prisma.stateMachine.delete({ where: { id } })
  }

  async findIterations(id: string, page = 1, limit = 50) {
    await this.findOne(id)
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.prisma.iteration.findMany({
        where: { machineId: id }, skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.iteration.count({ where: { machineId: id } }),
    ])
    return { items, total }
  }

  /** List version snapshots of a state machine (newest first). */
  async listVersions(id: string) {
    await this.findOne(id)
    const versions = await this.prisma.stateMachineVersion.findMany({
      where: { stateMachineId: id },
      orderBy: { versionNumber: 'desc' },
    })
    // Enrich each version with the count of iterations created from it.
    const iterationCounts = await this.prisma.iteration.groupBy({
      by: ['stateMachineVersionId'],
      where: { stateMachineVersionId: { in: versions.map((v) => v.id) } },
      _count: { id: true },
    })
    const countMap = new Map(iterationCounts.map((c) => [c.stateMachineVersionId, c._count.id]))
    return versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      versionLabel: v.versionLabel,
      createdAt: v.createdAt,
      createdById: v.createdById,
      // Compact metadata; full nodes/edges only on detail endpoint.
      nodeCount: this.tryCountArray(v.nodesJson),
      edgeCount: this.tryCountArray(v.edgesJson),
      iterationCount: countMap.get(v.id) ?? 0,
    }))
  }

  /** Fetch a specific version (full snapshot with nodes + edges). */
  async getVersion(id: string, versionNumber: number) {
    const v = await this.prisma.stateMachineVersion.findUnique({
      where: { stateMachineId_versionNumber: { stateMachineId: id, versionNumber } },
    })
    if (!v) throw new NotFoundException(`Version ${versionNumber} not found for state machine ${id}`)
    return {
      id: v.id,
      stateMachineId: v.stateMachineId,
      versionNumber: v.versionNumber,
      versionLabel: v.versionLabel,
      createdAt: v.createdAt,
      createdById: v.createdById,
      nodes: this.tryParseArray(v.nodesJson),
      edges: this.tryParseArray(v.edgesJson),
      groups: this.tryParseArray(v.groupsJson),
    }
  }

  private tryCountArray(json: string | null | undefined): number {
    if (!json) return 0
    try {
      const v = JSON.parse(json)
      return Array.isArray(v) ? v.length : 0
    } catch { return 0 }
  }

  private tryParseArray(json: string | null | undefined): any[] {
    if (!json) return []
    try {
      const v = JSON.parse(json)
      return Array.isArray(v) ? v : []
    } catch { return [] }
  }

  private deserialize(m: any) {
    if (!m) return m
    // All JSON columns are parsed defensively (safeJsonArray → [] on malformed
    // data) so a single corrupt machine row degrades gracefully (empty graph,
    // recoverable via re-save) instead of 500-ing the entire /machines list.
    // NOTE: must NOT reference `this` — deserialize is passed unbound as
    // `items.map(this.deserialize)` in findAll.
    return {
      ...m,
      nodes: safeJsonArray(m.nodesJson),
      edges: safeJsonArray(m.edgesJson),
      groups: safeJsonArray(m.groupsJson),
      tags: safeJsonArray(m.tags),
      nodesJson: undefined,
      edgesJson: undefined,
      groupsJson: undefined,
    }
  }
}
