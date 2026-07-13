import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { DispatcherService } from './dispatcher.service'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { v4 as uuidv4 } from 'uuid'

@ApiTags('execution')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exec')
export class ExecutionController {
  constructor(private dispatcher: DispatcherService) {}

  @Post('run')
  // OWNER and SUPERADMIN may trigger AUTOMATIC handlers; OPERATOR cannot
  // (operators interact via /iterations/:id/nodes/:nodeId/{claim,complete}).
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  async runNode(@Body() body: {
    nodeTypeId: string
    iterationId: string
    nodeId: string
    nodeLabel: string
    partner?: string
    config?: Record<string, any>
    inputs?: Record<string, unknown>
  }) {
    const jobId = uuidv4()
    await this.dispatcher.dispatch(body.nodeTypeId, {
      iterationId: body.iterationId,
      nodeId: body.nodeId,
      nodeLabel: body.nodeLabel,
      partner: body.partner ?? 'System',
      config: body.config ?? {},
      inputs: body.inputs ?? {},
    })
    return { jobId, status: 'QUEUED' }
  }
}
