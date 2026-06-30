import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "./database/entities/company.entity";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { TenantMiddleware } from "./modules/tenant/tenant.middleware";
import { TENANT_AWARE_CONTROLLERS } from "./modules/tenant/tenant-aware-controllers";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ServicesModule } from "./modules/services/services.module";

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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Tenant-scoping nas rotas tenant-aware. auth/* e health ficam de fora
    // (login/refresh são pré-tenant; o middleware também no-opa sem token).
    // A lista vem da fonte única TENANT_AWARE_CONTROLLERS — o guard-rail
    // (tenant-coverage.e2e-spec.ts) falha se um controller tenant-aware ficar
    // de fora dela (DL-027). Registre novos controllers de domínio lá.
    consumer.apply(TenantMiddleware).forRoutes(...TENANT_AWARE_CONTROLLERS);
  }
}
