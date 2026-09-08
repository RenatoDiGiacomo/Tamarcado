import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../../database/entities/company.entity";
import { UsersModule } from "../users/users.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { PlatformController } from "./platform.controller";
import { PasswordResetController } from "./password-reset.controller";
import { PlatformService } from "./platform.service";
import { PlatformKeyGuard } from "./platform-key.guard";
import { PlatformRateLimitService } from "./platform-rate-limit.service";

/**
 * Módulo de plataforma (Story 1.9). Reusa o `UsersService` (fluxo de
 * `user_invites`) para convidar o owner. PRÉ-TENANT — o controller vai em
 * PRE_TENANT_CONTROLLERS (DL-027); não passa pelo TenantMiddleware.
 */
@Module({
  // CapabilitiesModule: a contratação aplica o PRESET do plano (DL-072, 6.11).
  imports: [TypeOrmModule.forFeature([Company]), UsersModule, CapabilitiesModule],
  controllers: [PlatformController, PasswordResetController],
  providers: [PlatformService, PlatformKeyGuard, PlatformRateLimitService],
})
export class PlatformModule {}
