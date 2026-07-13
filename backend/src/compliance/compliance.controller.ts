import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { ComplianceReportService } from './compliance-report.service'
import { DppService } from './dpp.service'
import { ComponentPassportService } from './component-passport.service'
import { VersionCompareService } from './version-compare.service'

@ApiTags('compliance')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ComplianceController {
  constructor(
    private report: ComplianceReportService,
    private dpp: DppService,
    private passport: ComponentPassportService,
    private compare: VersionCompareService,
  ) {}

  @Get('compliance/iteration/:id/report')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  iterationReport(@Param('id') id: string) { return this.report.forIteration(id) }

  @Get('compliance/components/:ref/dpp')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  digitalProductPassport(@Param('ref') ref: string) { return this.dpp.byComponent(decodeURIComponent(ref)) }

  @Get('components')
  listComponents() { return this.passport.listKnown() }

  @Get('components/:ref/passport')
  componentPassport(@Param('ref') ref: string) { return this.passport.passport(decodeURIComponent(ref)) }

  @Get('compare/state-machines')
  cmpSm(@Query('left') left: string, @Query('right') right: string) {
    return this.compare.compareStateMachines(left, right)
  }

  @Get('compare/iterations')
  cmpIt(@Query('left') left: string, @Query('right') right: string) {
    return this.compare.compareIterations(left, right)
  }

  /** Diff between two immutable versions of the same state machine. */
  @Get('compare/state-machine-versions')
  cmpSmVersions(
    @Query('machineId') machineId: string,
    @Query('left') left: string,
    @Query('right') right: string,
  ) {
    return this.compare.compareStateMachineVersions(machineId, Number(left), Number(right))
  }
}
