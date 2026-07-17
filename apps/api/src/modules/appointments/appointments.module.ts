import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import { Company } from "../../database/entities/company.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { AppointmentsRepository } from "./appointments.repository";

/**
 * Agenda do painel (Story 3.2) — listagem de agendamentos por período. Exporta
 * o service para as Stories 3.3/3.4 (criar/cancelar) reaproveitarem o acesso.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Company]),
    TenantModule,
    UsersModule, // ActiveUserGuard depende de UsersService
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsRepository, ActiveUserGuard],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
