import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { NormalizerService, type NodeInputSchema } from './normalizer.service'
import { supportedUnits } from './qudt-units'

@ApiTags('normalization')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('normalization')
export class NormalizationController {
  constructor(private svc: NormalizerService) {}

  @Post('normalize')
  normalize(@Body() body: { payload: any; schema: NodeInputSchema[] }) {
    return this.svc.normalize(body.payload, body.schema ?? [])
  }

  @Get('units')
  units() { return { supported: supportedUnits() } }

  @Get('urns')
  urns() { return this.svc.urns.listAll() }

  @Post('urns')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  registerUrn(@Body() body: { kind: any; urn: string; canonicalName: string; aliases?: string[] }) {
    this.svc.registerUrn(body.kind, body.urn, body.canonicalName, body.aliases ?? [])
    return { ok: true }
  }
}
