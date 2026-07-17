import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { AppointmentsService, type AgendaPeriod } from "./appointments.service";
import { ListAppointmentsQueryDto } from "./dto/list-appointments-query.dto";

/**
 * Agenda do painel (Story 3.2). Listagem por período para qualquer usuário
 * autenticado do tenant; a visibilidade por papel (DL-022) é aplicada no service
 * (não com @Roles — todos leem, mas o `basic` só vê os próprios + não atribuídos).
 * Tenant-aware: registrado em TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01).
 */
@ApiTags("appointments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /** Agendamentos do período (`?from&to`, datas civis) + horário comercial. */
  @Get()
  async list(
    @Query() q: ListAppointmentsQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AgendaPeriod> {
    return this.appointments.listByPeriod(q.from, q.to, user);
  }
}
