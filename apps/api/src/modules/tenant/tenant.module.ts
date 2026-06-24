import { Module } from "@nestjs/common";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/**
 * Provê o `TenantContextService` como singleton, compartilhado entre o
 * `TenantMiddleware` (wired no AppModule) e os TenantAwareRepository.
 * O middleware é aplicado pelo AppModule, que reúne suas dependências
 * (JwtService, repositório de Company).
 */
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
