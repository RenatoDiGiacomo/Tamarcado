import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Company } from "../../database/entities/company.entity";
import { CompanyPlanChange } from "../../database/entities/company-plan-change.entity";
import { UsersModule } from "../users/users.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { PlatformController } from "./platform.controller";
import { PlatformWhatsAppController } from "./platform-whatsapp.controller";
import { PasswordResetController } from "./password-reset.controller";
import { PlatformService } from "./platform.service";
import { PlatformKeyGuard } from "./platform-key.guard";
import { PlatformRateLimitService } from "./platform-rate-limit.service";

/**
 * Módulo de plataforma (Story 1.9). Reusa o `UsersService` (fluxo de
 * `user_invites`) para convidar o owner. PRÉ-TENANT — o controller vai em
 * PRE_TENANT_CONTROLLERS (DL-027); não passa pelo TenantMiddleware.
 *
 * A Story 6.16 acrescenta a TROCA de plano de uma empresa existente, com o
 * registro de auditoria (`CompanyPlanChange`) que sustenta uma divergência
 * comercial meses depois — ver `platform.service.ts#changePlan`.
 */
@Module({
  // CapabilitiesModule: a contratação aplica o PRESET do plano (DL-072, 6.11).
  imports: [
    TypeOrmModule.forFeature([Company, CompanyPlanChange]),
    UsersModule,
    CapabilitiesModule,
    // Story 6.1: conectar o WhatsApp de um tenant à mão, enquanto a 6.12
    // (Embedded Signup) está bloqueada pelo CNPJ inapto (DL-073).
    WhatsAppModule,
  ],
  controllers: [
    PlatformController,
    PasswordResetController,
    PlatformWhatsAppController,
  ],
  providers: [PlatformService, PlatformKeyGuard, PlatformRateLimitService],
})
export class PlatformModule {}
