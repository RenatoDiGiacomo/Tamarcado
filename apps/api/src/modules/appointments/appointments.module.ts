import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import { AppointmentChange } from "../../database/entities/appointment-change.entity";
import { Company } from "../../database/entities/company.entity";
import { User } from "../../database/entities/user.entity";
import { SalonService } from "../../database/entities/salon-service.entity";
import { Payment } from "../../database/entities/payment.entity";
import { TenantModule } from "../tenant/tenant.module";
import { UsersModule } from "../users/users.module";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { AppointmentsRepository } from "./appointments.repository";
import { PaymentsService } from "./payments.service";

/**
 * Agenda do painel (Story 3.2) — listagem de agendamentos por período. Exporta
 * o service para as Stories 3.3/3.4 (criar/cancelar) reaproveitarem o acesso.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      AppointmentChange,
      Company,
      User,
      SalonService,
      Payment,
    ]),
    TenantModule,
    UsersModule, // ActiveUserGuard depende de UsersService
  ],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    AppointmentsRepository,
    PaymentsService,
    ActiveUserGuard,
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
