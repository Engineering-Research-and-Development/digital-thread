import { Module } from '@nestjs/common'
import { PartnerScopeGuard } from '@/auth/guards/partner-scope.guard'
import { IterationsModule } from '@/iterations/iterations.module'
import { FilesModule } from '@/files/files.module'
import { ApiKeyModule } from '@/api-key/api-key.module'
import { ExtApiController } from './ext-api.controller'
import { ExtApiService } from './ext-api.service'

/**
 * ExtApiModule — the dedicated external REST API surface
 * (`/api/v1/ext`). Reuses IterationsService + FilesService (no permission logic
 * duplicated) and authenticates via the per-user API key (ApiKeyModule).
 * PartnerScopeGuard is provided here so the controller can apply it per-route.
 */
@Module({
  imports: [ApiKeyModule, IterationsModule, FilesModule],
  controllers: [ExtApiController],
  providers: [ExtApiService, PartnerScopeGuard],
})
export class ExtApiModule {}
