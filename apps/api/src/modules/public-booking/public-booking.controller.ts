import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  PublicBookingService,
  type PublicInstallationView,
  type PublicProfessionalView,
  type PublicServiceView,
} from "./public-booking.service";

/**
 * Página pública de agendamento (Story 5B.1) — SEM login. O tenant é resolvido
 * pelo `:slug` da URL via `PublicSlugTenantMiddleware` (registrado em
 * `PUBLIC_TENANT_CONTROLLERS`, guard-rail DL-027). Só leituras públicas aqui;
 * disponibilidade e criação de pendente são a 5B.2 (não neste escopo).
 */
@ApiTags("public")
@Controller("public/:slug")
export class PublicBookingController {
  constructor(private readonly booking: PublicBookingService) {}

  /** Branding do estabelecimento (nome/logo/cor) — whitelisted (DL-034). */
  @Get("installation")
  installation(): Promise<PublicInstallationView> {
    return this.booking.getInstallation();
  }

  /** Serviços ativos oferecidos. */
  @Get("services")
  services(): Promise<{ services: PublicServiceView[] }> {
    return this.booking.listServices();
  }

  /** Profissionais ativos (opcional no agendamento — DL-049). */
  @Get("professionals")
  professionals(): Promise<{ professionals: PublicProfessionalView[] }> {
    return this.booking.listProfessionals();
  }
}
