import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AdminAuditInterceptor } from './common/audit/admin-audit.interceptor'
import configuration from './config/configuration'
import { PrismaModule } from './database/prisma.module'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'
import { RolesGuard } from './auth/guards/roles.guard'
import { PartnersModule } from './partners/partners.module'
import { DataSourcesModule } from './datasources/datasources.module'
import { MachinesModule } from './machines/machines.module'
import { FilesModule } from './files/files.module'
import { EventsModule } from './events/events.module'
import { IterationsModule } from './iterations/iterations.module'
import { ExecutionModule } from './execution/execution.module'
import { StandardsModule } from './standards/standards.module'
import { HealthModule } from './health/health.module'
import { UsersModule } from './users/users.module'
import { AppThrottlerModule } from './common/security/throttler.module'
import { SecurityModule } from './common/security/security.module'
import { ProvenanceModule } from './provenance/provenance.module'
import { LineageModule } from './lineage/lineage.module'
import { BindingModule } from './binding/binding.module'
import { NormalizationModule } from './normalization/normalization.module'
import { EnrichmentModule } from './enrichment/enrichment.module'
import { GovernanceModule } from './governance/governance.module'
import { ChangeMgmtModule } from './change-mgmt/change-mgmt.module'
import { ComplianceModule } from './compliance/compliance.module'
import { IngestionModule } from './ingestion/ingestion.module'
import { ObservabilityModule } from './common/observability/observability.module'
import { DashboardsModule } from './dashboards/dashboards.module'
import { OidcModule } from './auth/oidc/oidc.module'
import { RetentionModule } from './retention/retention.module'
import { NotificationsModule } from './notifications/notifications.module'
import { UsageFrameworkModule } from './usage-framework/usage-framework.module'
import { TracingModule } from './common/observability/tracing.module'
import { AasRegistrySyncModule } from './standards/aas/registry-sync.module'
import { NodeTemplatesModule } from './node-templates/node-templates.module'
import { AuditModule } from './audit/audit.module'
import { ProductsModule } from './products/products.module'
import { ExtApiModule } from './ext-api/ext-api.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuthModule,
    PartnersModule,
    DataSourcesModule,
    MachinesModule,
    FilesModule,
    EventsModule,
    IterationsModule,
    ExecutionModule,
    StandardsModule,
    HealthModule,
    UsersModule,
    AppThrottlerModule,
    SecurityModule,
    ProvenanceModule,
    LineageModule,
    BindingModule,
    NormalizationModule,
    EnrichmentModule,
    GovernanceModule,
    ChangeMgmtModule,
    ComplianceModule,
    IngestionModule,
    ObservabilityModule,
    DashboardsModule,
    OidcModule,
    RetentionModule,
    NotificationsModule,
    UsageFrameworkModule,
    TracingModule,
    AasRegistrySyncModule,
    NodeTemplatesModule,
    AuditModule,
    ProductsModule,
    ExtApiModule,
  ],
  providers: [
    // Apply JwtAuthGuard globally — use @SetMetadata(IS_PUBLIC_KEY, true) to opt-out.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Apply RolesGuard globally — use @Roles(...) on controller methods to require a role.
    // Methods/controllers without @Roles() pass through.
    { provide: APP_GUARD, useClass: RolesGuard },
    // AdminAuditLog interceptor — records every mutating request by users of any role for the audit console.
    { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
  ],
})
export class AppModule {}
