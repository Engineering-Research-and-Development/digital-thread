import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { ROLE } from '../roles'
import { normalizeNodesJson } from '@/iterations/normalize-node'

/**
 * PartnerScopeGuard
 *
 * Enforces row-level visibility for partner-bound roles (OWNER + OPERATOR):
 *   - SUPERADMIN bypasses (sees everything).
 *   - For routes with `:id` (iterationId): the caller's partner must either
 *     OWN the iteration (`ownerPartnerId`) OR be responsible for at least one
 *     node (multi-partner aware) in the iteration's FROZEN workflow version.
 *   - For routes with `:nodeId` (a node action — claim/complete/upload/input):
 *     the caller's partner must be responsible for that specific node. This
 *     applies to OWNER too (an OWNER acts as an operator of its own partner).
 *
 * Node-to-partner mapping reads the iteration's frozen, immutable workflow
 * version, via normalizeFlowNode, matching on responsiblePartnerIds (ids) or
 * the legacy responsiblePartner name. Fails closed on missing data.
 */
@Injectable()
export class PartnerScopeGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    if (!user) throw new ForbiddenException('No authenticated user')

    if (user.role === ROLE.SUPERADMIN) return true
    if (user.role !== ROLE.OWNER && user.role !== ROLE.OPERATOR) {
      throw new ForbiddenException('Unknown role')
    }
    if (!user.partnerId) throw new ForbiddenException(`${user.role} user must have a partnerId`)

    const partner = await this.prisma.partner.findUnique({ where: { id: user.partnerId } })
    if (!partner) throw new ForbiddenException('Partner not found')

    const iterationId: string | undefined = req.params?.id
    const nodeId: string | undefined = req.params?.nodeId
    if (!iterationId) {
      // Listing endpoints: scope is enforced at the service layer (filter).
      return true
    }

    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { machine: true, stateMachineVersion: true },
    })
    if (!iter) throw new ForbiddenException('Iteration not found')

    // Read the FROZEN workflow this iteration ran against (fallback to head).
    const sourceJson = iter.stateMachineVersion?.nodesJson ?? iter.machine?.nodesJson ?? '[]'
    const nodes = normalizeNodesJson(sourceJson)
    const ownPartnerNodeIds = new Set(
      nodes
        .filter(
          (n) =>
            (n.responsiblePartnerIds ?? []).includes(partner.id) ||
            n.responsiblePartner === partner.name,
        )
        .map((n) => n.id),
    )
    const ownsIteration = iter.ownerPartnerId === partner.id

    // Node-specific action — the node must belong to the caller's partner.
    if (nodeId) {
      if (!ownPartnerNodeIds.has(nodeId)) {
        throw new ForbiddenException('Node is not assigned to your partner')
      }
      return true
    }

    // Iteration-level view — visible if owned by, or involving, the partner.
    if (ownsIteration || ownPartnerNodeIds.size > 0) return true
    throw new ForbiddenException('This iteration is not visible to your partner')
  }
}
