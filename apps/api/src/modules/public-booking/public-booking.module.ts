import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../../database/entities/company.entity";
import { SalonService } from "../../database/entities/salon-service.entity";
import { User } from "../../database/entities/user.entity";
import { Client } from "../../database/entities/client.entity";
import { Appointment } from "../../database/entities/appointment.entity";
import { TenantModule } from "../tenant/tenant.module";
import { ServicesModule } from "../services/services.module";
import { UsersModule } from "../users/users.module";
import { AvailabilityModule } from "../availability/availability.module";
import { PublicBookingController } from "./public-booking.controller";
import { PublicBookingService } from "./public-booking.service";
import { PublicRateLimitService } from "./public-rate-limit.service";

/**
 * Agendamento público por link (Épico 5B). Story 5B.1: leituras públicas por
 * slug (branding/serviços/profissionais). Story 5B.2: disponibilidade + criação
 * do PENDENTE (`source=link`). Reusa `ServicesService`/`UsersService`/
 * `AvailabilityService` (tenant-scoped) — o tenant vem do
 * `PublicSlugTenantMiddleware` (por slug).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      SalonService,
      User,
      Client,
      Appointment,
    ]),
    TenantModule,
    ServicesModule,
    UsersModule,
    AvailabilityModule,
  ],
  controllers: [PublicBookingController],
  providers: [PublicBookingService, PublicRateLimitService],
})
export class PublicBookingModule {}
