import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import { Company } from "../../database/entities/company.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DashboardRepository } from "./dashboard.repository";

/**
 * Dashboard (Story 5.6) — números do negócio, somente leitura. UsersModule entra
 * porque o ActiveUserGuard (base do ModuleGuard) depende do UsersService. O
 * DashboardRepository (tenant-aware) faz as leituras; Client/Payment entram por
 * join / manager, sem precisar de forFeature aqui.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Company]),
    TenantModule,
    UsersModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository, ActiveUserGuard],
})
export class DashboardModule {}
