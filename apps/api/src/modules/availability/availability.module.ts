import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SalonService } from "../../database/entities/salon-service.entity";
import { ProfessionalService } from "../../database/entities/professional-service.entity";
import { ProfessionalSchedule } from "../../database/entities/professional-schedule.entity";
import { User } from "../../database/entities/user.entity";
import { Appointment } from "../../database/entities/appointment.entity";
import { Company } from "../../database/entities/company.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { SalonServicesRepository } from "../services/services.repository";
import { ProfessionalSchedulesRepository } from "../schedules/schedules.repository";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";

/**
 * Cálculo de disponibilidade (Story 3.1). Lê (somente) as tabelas que cruza —
 * serviços, vínculo prof↔serviço, horários, usuários, agendamentos e o timezone
 * do tenant. Exporta o service para a Story 3.3 (criação atômica) e o Épico 6 (bot).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalonService,
      ProfessionalService,
      ProfessionalSchedule,
      User,
      Appointment,
      Company,
    ]),
    TenantModule,
    UsersModule, // ActiveUserGuard depende de UsersService
  ],
  controllers: [AvailabilityController],
  providers: [
    AvailabilityService,
    SalonServicesRepository,
    ProfessionalSchedulesRepository,
    ActiveUserGuard,
  ],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
