import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProfessionalSchedule } from "../../database/entities/professional-schedule.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { SchedulesController } from "./schedules.controller";
import { SchedulesService } from "./schedules.service";
import { ProfessionalSchedulesRepository } from "./schedules.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfessionalSchedule]),
    TenantModule,
    UsersModule, // UsersService p/ validar attends_clients e persistir o intervalo
  ],
  controllers: [SchedulesController],
  providers: [SchedulesService, ProfessionalSchedulesRepository, ActiveUserGuard],
  exports: [SchedulesService],
})
export class SchedulesModule {}
