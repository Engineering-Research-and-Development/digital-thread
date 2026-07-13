import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { ROLE, type Role } from '@/auth/roles'
import { NotificationsService } from './notifications.service'
import {
  CreateSubscriptionDto,
  SmtpConfigDto,
  TestEmailDto,
  UpdateSubscriptionDto,
} from './dto/notification.dto'

interface ReqUser {
  id: string
  email: string
  role: Role
  partnerId?: string | null
}

/**
 * Per-user notifications API. Subscription management, the event
 * catalog and notification history are available to EVERY authenticated user
 * (incl. OPERATOR); SMTP relay configuration is SUPERADMIN-only.
 */
@ApiTags('notifications')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  /** Semantic event catalog the current user may subscribe to. */
  @Get('events')
  events(@CurrentUser() user: ReqUser) {
    return this.svc.catalogForRole(user.role)
  }

  @Get('subscriptions')
  list(@CurrentUser() user: ReqUser) {
    return this.svc.listSubscriptions(user)
  }

  @Post('subscriptions')
  create(@CurrentUser() user: ReqUser, @Body() body: CreateSubscriptionDto) {
    return this.svc.createSubscription(user, body)
  }

  @Patch('subscriptions/:id')
  update(@CurrentUser() user: ReqUser, @Param('id') id: string, @Body() body: UpdateSubscriptionDto) {
    return this.svc.updateSubscription(user, id, body)
  }

  @Delete('subscriptions/:id')
  remove(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.removeSubscription(user, id)
  }

  /** Send a synthetic test notification through a channel. */
  @Post('subscriptions/:id/test')
  test(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.testSubscription(user, id)
  }

  /** The current user's notification history (SUPERADMIN may pass all=true). */
  @Get('history')
  history(
    @CurrentUser() user: ReqUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('eventKey') eventKey?: string,
    @Query('all') all?: string,
  ) {
    return this.svc.history(user, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      status,
      eventKey,
      all: all === 'true',
    })
  }

  // ─── SMTP relay configuration (SUPERADMIN) ────────────────────────────────

  @Get('smtp')
  @Roles(ROLE.SUPERADMIN)
  getSmtp() {
    return this.svc.getSmtp()
  }

  @Put('smtp')
  @Roles(ROLE.SUPERADMIN)
  saveSmtp(@CurrentUser() user: ReqUser, @Body() body: SmtpConfigDto) {
    return this.svc.saveSmtp(body, user.id)
  }

  @Post('smtp/test')
  @Roles(ROLE.SUPERADMIN)
  testSmtp(@Body() body: TestEmailDto) {
    return this.svc.testSmtp(body.to)
  }
}
