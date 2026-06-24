import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "./database/entities/company.entity";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { TenantModule } from "./modules/tenant/tenant.module";
import { TenantMiddleware } from "./modules/tenant/tenant.middleware";
import { UsersModule } from "./modules/users/users.module";
import { UsersController } from "./modules/users/users.controller";
import { AuthModule } from "./modules/auth/auth.module";

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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Tenant-scoping nas rotas tenant-aware. auth/* e health ficam de fora
    // (login/refresh são pré-tenant; o middleware também no-opa sem token).
    // Cada novo controller tenant-aware deve ser adicionado aqui.
    consumer.apply(TenantMiddleware).forRoutes(UsersController);
  }
}
