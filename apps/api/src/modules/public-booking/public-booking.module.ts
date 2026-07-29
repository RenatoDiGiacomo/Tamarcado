import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../../database/entities/company.entity";
import { TenantModule } from "../tenant/tenant.module";
import { ServicesModule } from "../services/services.module";
import { UsersModule } from "../users/users.module";
import { PublicBookingController } from "./public-booking.controller";
import { PublicBookingService } from "./public-booking.service";

/**
 * Agendamento público por link (Épico 5B). Story 5B.1: leituras públicas por
 * slug (branding/serviços/profissionais). Reusa `ServicesService`/`UsersService`
 * (tenant-scoped) — o tenant vem do `PublicSlugTenantMiddleware` (por slug).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    TenantModule,
    ServicesModule,
    UsersModule,
  ],
  controllers: [PublicBookingController],
  providers: [PublicBookingService],
})
export class PublicBookingModule {}
