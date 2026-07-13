import { Module } from '@nestjs/common'
import { ApiKeyService } from './api-key.service'
import { ApiKeyGuard } from './api-key.guard'

/**
 * ApiKeyModule — provides the per-user external API key service
 * and guard. PrismaService is global. Imported by UsersModule (key management
 * endpoints) and ExtApiModule (the external REST surface).
 */
@Module({
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeyModule {}
