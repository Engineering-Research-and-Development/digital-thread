import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { AidImporterService } from './aid-importer.service'
import { CorrelationService } from './correlation.service'

@ApiTags('ingestion')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ingestion')
export class IngestionController {
  constructor(
    private aid: AidImporterService,
    private correlation: CorrelationService,
  ) {}

  @Post('aid/import')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  importAid(@Body() body: { aid: any; aimc?: any; targetStateMachineId?: string; ownerPartnerId?: string }) {
    return this.aid.import(body)
  }

  @Post('push')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  push(@Body() body: {
    dataSourceId: string
    topic: string
    payload: any
    correlationValue?: string
    correlationMetadataKey?: string
  }) {
    return this.correlation.ingestPushEvent(body)
  }

  @Get('unassigned')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  listUnassigned() { return this.correlation.listUnassigned() }

  @Patch('unassigned/:id/assign')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  assign(@Param('id') id: string, @Body() body: { iterationId: string; nodeId?: string; inputId?: string }) {
    return this.correlation.assignToIteration(id, body.iterationId, body.nodeId, body.inputId)
  }

  @Get('records')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  records(@Query('dataSourceId') dataSourceId?: string, @Query('iterationId') iterationId?: string) {
    // Reuse Prisma from one of the services' injected client
    return this.correlation.listUnassigned().then(async (u) => {
      if (!dataSourceId && !iterationId) return u
      // Caller wants a filtered view — do another query via the service's prisma;
      // we expose via the already-injected CorrelationService for brevity.
      return u.filter((r) =>
        (!dataSourceId || r.dataSourceId === dataSourceId) &&
        (!iterationId || r.iterationId === iterationId),
      )
    })
  }
}
