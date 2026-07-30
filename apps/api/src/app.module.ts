import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "./database/entities/company.entity";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { TenantMiddleware } from "./modules/tenant/tenant.middleware";
import { PublicSlugTenantMiddleware } from "./modules/public-booking/public-slug-tenant.middleware";
import {
  PUBLIC_TENANT_CONTROLLERS,
  TENANT_AWARE_CONTROLLERS,
} from "./modules/tenant/tenant-aware-controllers";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ServicesModule } from "./modules/services/services.module";
import { SchedulesModule } from "./modules/schedules/schedules.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { AppointmentsModule } from "./modules/appointments/appointments.module";
import { InstallationModule } from "./modules/installation/installation.module";
import { InstallationController } from "./modules/installation/installation.controller";
import { PublicBookingModule } from "./modules/public-booking/public-booking.module";
import { PlatformModule } from "./modules/platform/platform.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TenantModule,
    // Dependências do TenantMiddleware (resolvido neste contexto pelo configure):
    JwtModule.register({}),
    TypeOrmModule.forFeature([Company]),
    HealthModule,
    UsersModule,
    AuthModule,
    ServicesModule,
    SchedulesModule,
    ClientsModule,
    AvailabilityModule,
    AppointmentsModule,
    InstallationModule,
    PublicBookingModule,
    PlatformModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Tenant-scoping nas rotas tenant-aware. auth/* e health ficam de fora
    // (login/refresh são pré-tenant; o middleware também no-opa sem token).
    // A lista vem da fonte única TENANT_AWARE_CONTROLLERS — o guard-rail
    // (tenant-coverage.e2e-spec.ts) falha se um controller tenant-aware ficar
    // de fora dela (DL-027). Registre novos controllers de domínio lá.
    // InstallationController NÃO é tenant-aware (companies não usa
    // TenantAwareRepository), mas usa o ActiveUserGuard, que faz lookup
    // tenant-scoped — por isso também precisa do TenantMiddleware (contexto).
    // Fica fora de TENANT_AWARE_CONTROLLERS (guard-rail): não é repo tenant-aware.
    consumer
      .apply(TenantMiddleware)
      .forRoutes(...TENANT_AWARE_CONTROLLERS, InstallationController);

    // Rotas PÚBLICAS (Story 5B.1): tenant resolvido pelo SLUG da URL, sem JWT.
    // Aplicado à 3ª categoria PUBLIC_TENANT_CONTROLLERS (guard-rail DL-027).
    consumer
      .apply(PublicSlugTenantMiddleware)
      .forRoutes(...PUBLIC_TENANT_CONTROLLERS);
  }
}
