import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  PublicBookingService,
  type CreatedPublicAppointment,
  type PublicInstallationView,
  type PublicProfessionalView,
  type PublicServiceView,
} from "./public-booking.service";
import type { DayAvailability } from "../availability/availability.service";
import { GetDaySlotsQueryDto } from "../availability/dto/availability-query.dto";
import { CreatePublicAppointmentDto } from "./dto/create-public-appointment.dto";

/**
 * Página pública de agendamento (Épico 5B) — SEM login. O tenant é resolvido
 * pelo `:slug` da URL via `PublicSlugTenantMiddleware` (`PUBLIC_TENANT_CONTROLLERS`,
 * guard-rail DL-027). 5B.1: leituras (branding/serviços/profissionais). 5B.2:
 * disponibilidade + criação do PENDENTE (hostil por padrão — ver o service).
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

  /** Horários livres de um serviço num dia (`?serviceId&date&professionalId?`). */
  @Get("availability")
  availability(@Query() q: GetDaySlotsQueryDto): Promise<DayAvailability> {
    return this.booking.getAvailability({
      serviceId: q.serviceId,
      date: q.date,
      professionalId: q.professionalId,
    });
  }

  /**
   * Cria o agendamento PENDENTE (5B.2). Whitelist ESTRITA no BODY CRU (§AC4/DL-034):
   * o `ValidationPipe` global (whitelist) removeria o campo extra ANTES de validá-lo,
   * então checamos as chaves de `req.body` diretamente e rejeitamos o que não é
   * permitido — nada de `companyId`/`status`/`id` mesmo injetado por console/curl.
   * `@Ip()` alimenta o rate limit + a janela antispam.
   */
  @Post("appointments")
  create(
    @Param("slug") slug: string,
    @Ip() ip: string,
    @Req() req: Request,
    @Body() dto: CreatePublicAppointmentDto,
  ): Promise<CreatedPublicAppointment> {
    const allowed = new Set([
      "name",
      "phone",
      "serviceId",
      "date",
      "time",
      "professionalId",
      "consent",
      "website",
    ]);
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const extra = Object.keys(raw).filter((k) => !allowed.has(k));
    if (extra.length > 0) {
      throw new BadRequestException(`Campo não permitido: ${extra.join(", ")}.`);
    }
    return this.booking.createPending(dto, ip, slug);
  }
}
