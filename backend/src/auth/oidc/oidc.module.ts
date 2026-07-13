import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { OidcController } from './oidc.controller'
import { OidcService } from './oidc.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret') ?? 'fallback-secret',
        signOptions: { expiresIn: (config.get<string>('auth.jwtExpiresIn') ?? '15m') as any },
      }),
    }),
  ],
  controllers: [OidcController],
  providers: [OidcService],
  exports: [OidcService],
})
export class OidcModule {}
