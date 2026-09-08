import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CompanyCapability } from "../../database/entities/company-capability.entity";
import { TenantModule } from "../tenant/tenant.module";
import { CapabilityGuard } from "../auth/guards/capability.guard";
import { CapabilitiesService } from "./capabilities.service";

/**
 * Capabilities por empresa (DL-072, Story 6.11).
 *
 * NÃO tem controller: esta story é a FUNDAÇÃO. A exposição ao front entra no
 * `/users/me` já existente (reusa o polling de flags do DL-062 — ver
 * `users.controller.ts`), e a ativação por endpoint de plataforma é a Story 6.16.
 *
 * O `CapabilityGuard` mora aqui (e não no AuthModule) porque depende do
 * `CapabilitiesService` — mesmo arranjo do `ActiveUserGuard` no `UsersModule`,
 * que existe para evitar ciclo de módulos.
 *
 * COMO UM MÓDULO DE DOMÍNIO CONSOME (Stories 6.1, 6.17, …): basta
 * `imports: [CapabilitiesModule]`. O guard é EXPORTADO junto do serviço, então
 * o consumidor NÃO precisa redeclará-lo em `providers` — diferente do
 * `ActiveUserGuard`, que cada módulo repete porque o `UsersModule` exporta só o
 * service. Menos boilerplate e um lugar a menos para esquecer.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CompanyCapability]), TenantModule],
  providers: [CapabilitiesService, CapabilityGuard],
  exports: [CapabilitiesService, CapabilityGuard],
})
export class CapabilitiesModule {}
