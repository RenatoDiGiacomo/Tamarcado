import { Type } from "@nestjs/common";
import { AuthController } from "../auth/auth.controller";
import { UsersController } from "../users/users.controller";
import { ServicesController } from "../services/services.controller";
import { SchedulesController } from "../schedules/schedules.controller";
import { AvailabilityController } from "../availability/availability.controller";

/**
 * FONTE ÚNICA DE VERDADE dos controllers protegidos pelo TenantMiddleware.
 *
 * O `AppModule.configure()` aplica o middleware exatamente a esta lista
 * (`forRoutes(...TENANT_AWARE_CONTROLLERS)`). O guard-rail
 * `tenant-coverage.spec.ts` FALHA a suíte se qualquer controller que dependa de
 * um `TenantAwareRepository` não estiver aqui (nem na allowlist pré-tenant
 * abaixo) — impedindo vazamento silencioso de tenant ao esquecer de registrar
 * um controller novo (DL-027).
 *
 * Ao criar um controller de domínio tenant-aware, adicione-o a esta lista.
 */
export const TENANT_AWARE_CONTROLLERS: Type[] = [
  UsersController,
  ServicesController,
  SchedulesController,
  AvailabilityController,
];

/**
 * Controllers que TOCAM (transitivamente) um `TenantAwareRepository` mas que,
 * por decisão consciente, NÃO são protegidos pelo TenantMiddleware porque operam
 * ANTES de existir tenant (pré-tenant).
 *
 * Hoje: `AuthController` — login/refresh resolvem a company explicitamente e usam
 * apenas métodos *unscoped* do `UsersService` (`findByCompanyAndEmail` /
 * `findByIdUnscoped`), nunca os tenant-scoped (DL-026). Por isso o middleware
 * exclui `auth/*`.
 *
 * Toda entrada aqui é uma EXCEÇÃO auditável: o guard-rail exige que um controller
 * tenant-aware esteja OU em `TENANT_AWARE_CONTROLLERS` OU aqui. Um controller de
 * domínio novo NÃO entra nesta lista — ele vai em `TENANT_AWARE_CONTROLLERS`.
 */
export const PRE_TENANT_CONTROLLERS: Type[] = [AuthController];
