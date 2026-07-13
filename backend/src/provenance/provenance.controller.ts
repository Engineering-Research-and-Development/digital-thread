import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { ProvenanceService } from './provenance.service'
import { IterationStoryService } from './story.service'
import type { FastifyReply } from 'fastify'

@ApiTags('provenance')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('provenance')
export class ProvenanceController {
  constructor(private svc: ProvenanceService, private story: IterationStoryService) {}

  @Get('iteration/:id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  async getJson(@Param('id') id: string) {
    const ttl = await this.svc.exportTurtle(id)
    return { iterationId: id, format: 'text/turtle', body: ttl }
  }

  @Get('iteration/:id/graph')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  async getGraph(@Param('id') id: string) {
    return this.svc.exportGraph(id)
  }

  /**
   * Layperson-friendly projection of an iteration's provenance, used by the
   * Timeline, File-story, and Table tabs of the provenance page. Same source
   * data as `/graph` but denormalised — see story.service.ts.
   */
  @Get('iteration/:id/story')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  async getStory(@Param('id') id: string) {
    return this.story.buildStory(id)
  }

  @Get('iteration/:id.ttl')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  async getTurtle(@Param('id') id: string, @Res() reply: FastifyReply) {
    const ttl = await this.svc.exportTurtle(id)
    reply
      .status(200)
      .header('Content-Type', 'text/turtle; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="prov-${id}.ttl"`)
      .send(ttl)
  }
}
