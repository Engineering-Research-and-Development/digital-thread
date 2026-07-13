import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * Post-deployment field-issue tracking.
 *
 * Captures post-deployment incidents reported against a component URN and
 * supports linking back to the iteration that produced the component (for
 * lifecycle feedback into the design process).
 */
@Injectable()
export class FieldIssueService {
  constructor(private prisma: PrismaService) {}

  list(filter?: { componentRef?: string; status?: string }) {
    return this.prisma.fieldIssue.findMany({
      where: { componentRef: filter?.componentRef, status: filter?.status },
      orderBy: { createdAt: 'desc' },
    })
  }

  create(input: {
    componentRef: string
    description: string
    severity?: string
    capturedAt?: Date
    reporterId?: string
  }) {
    return this.prisma.fieldIssue.create({
      data: {
        componentRef: input.componentRef,
        description: input.description,
        severity: input.severity ?? 'MEDIUM',
        capturedAt: input.capturedAt ?? new Date(),
        reporterId: input.reporterId,
      },
    })
  }

  async link(issueId: string, input: { iterationId?: string; fileRecordId?: string }) {
    const fi = await this.prisma.fieldIssue.findUnique({ where: { id: issueId } })
    if (!fi) throw new NotFoundException('FieldIssue not found')
    return this.prisma.fieldIssue.update({
      where: { id: issueId },
      data: {
        linkedIterationId: input.iterationId,
        linkedFileRecordId: input.fileRecordId,
        status: 'LINKED',
      },
    })
  }

  close(issueId: string) {
    return this.prisma.fieldIssue.update({ where: { id: issueId }, data: { status: 'CLOSED' } })
  }
}
