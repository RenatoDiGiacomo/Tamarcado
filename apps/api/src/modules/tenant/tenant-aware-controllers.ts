import { Type } from "@nestjs/common";
import { AuthController } from "../auth/auth.controller";
import { PlatformController } from "../platform/platform.controller";
import { UsersController } from "../users/users.controller";
import { ServicesController } from "../services/services.controller";
import { SchedulesController } from "../schedules/schedules.controller";
import { AvailabilityController } from "../availability/availability.controller";
import { AppointmentsController } from "../appointments/appointments.controller";
import { ClientsController } from "../clients/clients.controller";
import { PublicBookingController } from "../public-booking/public-booking.controller";

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
  AppointmentsController,
  ClientsController,
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
 *
 * `PlatformController` (Story 1.9): provisiona um novo estabelecimento — cria a
 * company e o convite do owner ANTES de existir tenant. Reusa o `UsersService`
 * (por isso o guard-rail o vê como tenant-aware), mas só chama métodos CRUS
 * (`createInviteForCompany` com companyId explícito), nunca os tenant-scoped.
 * Protegido pelo `PlatformKeyGuard` (x-platform-key), não pelo TenantMiddleware.
 */
export const PRE_TENANT_CONTROLLERS: Type[] = [
  AuthController,
  PlatformController,
];

/**
 * TERCEIRA categoria (Story 5B.1 / DL-049): controllers PÚBLICOS que tocam
 * `TenantAwareRepository` mas resolvem o tenant pelo **slug da URL** (sem JWT),
 * via `PublicSlugTenantMiddleware`. Diferente do PRE_TENANT (que opera unscoped e
 * resolve na mão), aqui o scoping é **automático** — o middleware seta o
 * `TenantContext` e os repos saem filtrados sozinhos, mais seguro que scoping
 * manual.
 *
 * O `AppModule.configure()` aplica o `PublicSlugTenantMiddleware` exatamente a
 * esta lista. O guard-rail (DL-027) aceita a cobertura por QUALQUER das três
 * listas — o invariante continua: todo controller tenant-aware tem um middleware
 * que seta `company_id` antes do handler; só muda a FONTE do id (JWT vs slug).
 */
export const PUBLIC_TENANT_CONTROLLERS: Type[] = [PublicBookingController];
