import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  AvailabilityService,
  type DateWithSlots,
  type DayAvailability,
} from "./availability.service";
import {
  GetDaySlotsQueryDto,
  GetNextDatesQueryDto,
} from "./dto/availability-query.dto";

/**
 * Consulta de disponibilidade (Story 3.1, D6). Leitura para qualquer usuário
 * autenticado do tenant — o painel (agenda/manual) e, depois, o bot consomem.
 * Tenant-aware: registrado em TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01).
 */
@ApiTags("availability")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /** Horários livres de um serviço num dia (`?serviceId&date&professionalId?`).
   *  Inclui `reason` quando não há slots (para a UI diferenciar a mensagem). */
  @Get()
  async daySlots(@Query() q: GetDaySlotsQueryDto): Promise<DayAvailability> {
    return this.availability.getDayAvailability({
      serviceId: q.serviceId,
      date: q.date,
      professionalId: q.professionalId,
    });
  }

  /** Próximas datas com vaga (`?serviceId&fromDate&days?&professionalId?`). */
  @Get("next-dates")
  async nextDates(
    @Query() q: GetNextDatesQueryDto,
  ): Promise<{ dates: DateWithSlots[] }> {
    return {
      dates: await this.availability.getNextAvailableDates({
        serviceId: q.serviceId,
        fromDate: q.fromDate,
        days: q.days,
        professionalId: q.professionalId,
      }),
    };
  }
}
