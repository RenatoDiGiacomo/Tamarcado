import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import {
  AppointmentsService,
  type AgendaPeriod,
  type AssignProfessionalResult,
  type CreatedAppointment,
} from "./appointments.service";
import type { AppointmentView } from "./appointments.mapper";
import { ListAppointmentsQueryDto } from "./dto/list-appointments-query.dto";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto";
import { AssignProfessionalDto } from "./dto/assign-professional.dto";
import { EditAppointmentDto } from "./dto/edit-appointment.dto";
import { ChangeStatusDto } from "./dto/change-status.dto";
import { ConfirmPendingDto } from "./dto/confirm-pending.dto";
import { RejectPendingDto } from "./dto/reject-pending.dto";
import { Roles } from "../../common/decorators/roles.decorator";

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

  /** Pendentes do tenant (Story 5B.3) — a fila da tela Pendentes. Só owner/gerente. */
  @Get("pending")
  @Roles("owner", "manager")
  async listPending(): Promise<{ appointments: AppointmentView[] }> {
    return this.appointments.listPending();
  }

  /** Contagem de pendentes (Story 5B.3) — o contador/badge. Só owner/gerente. */
  @Get("pending-count")
  @Roles("owner", "manager")
  async pendingCount(): Promise<{ count: number }> {
    return this.appointments.pendingCount();
  }

  /**
   * Cria um agendamento manual (Story 3.3). `source=manual`, `status=confirmed`;
   * `basic` cria só para si. Slot ocupado NÃO bloqueia (retorna `overbooked`).
   */
  @Post()
  async create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CreatedAppointment> {
    return this.appointments.createManual(dto, user);
  }

  /**
   * Cancela um agendamento (Story 3.4). Motivo opcional; grava autoria
   * (`cancelled_by`=professional + `cancelled_by_user_id`). `basic` só os próprios.
   * Mantém visível como Cancelado; o slot volta aos disponíveis.
   */
  @Patch(":id/cancel")
  async cancel(
    @Param("id") id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AppointmentView> {
    return this.appointments.cancel(id, dto, user);
  }

  /**
   * Atribui/troca o profissional de um agendamento (Story 3.5/DL-043). Só muta
   * `professional_id` + auditoria. `basic` só atribui a si, e só quando está sem
   * profissional (D5). Conflito de horário avisa via `overbooked`, não bloqueia.
   */
  @Patch(":id/professional")
  async assignProfessional(
    @Param("id") id: string,
    @Body() dto: AssignProfessionalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AssignProfessionalResult> {
    return this.appointments.assignProfessional(id, dto.professionalId, user);
  }

  /**
   * Edição unificada (Story 3.6/DL-044): serviço, horário e/ou profissional juntos.
   * Re-snapshota ao trocar serviço; conflito avisa (`overbooked`), não bloqueia (D1);
   * grava o histórico de alteração (`appointment_changes`). Só *pending/confirmed*.
   */
  @Patch(":id")
  async edit(
    @Param("id") id: string,
    @Body() dto: EditAppointmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AssignProfessionalResult> {
    return this.appointments.editAppointment(id, dto, user);
  }

  /**
   * Marca comparecimento (Story 3.7/FR-D9): `confirmed` → `completed`/`no_show`.
   * Ações pontuais por transição válida; exige o horário já ter começado (D1/D2);
   * basic só o próprio (D3). Auditoria em `appointment_changes`. Sem notificação.
   */
  /**
   * Confirma um PENDENTE (Story 5B.3/DL-046): `pending → confirmed`, atribuindo o
   * profissional OPCIONALMENTE (PR-1). Leva ao badge "confirmado" da 3.7. Só
   * owner/gerente (PR-3). Auditado em `appointment_changes`. Também no modal.
   */
  @Patch(":id/confirm")
  @Roles("owner", "manager")
  async confirm(
    @Param("id") id: string,
    @Body() dto: ConfirmPendingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AppointmentView> {
    return this.appointments.confirmPending(id, dto.professionalId, user);
  }

  /**
   * Recusa um PENDENTE (Story 5B.3/FR-B4): `pending → cancelled` com motivo
   * OBRIGATÓRIO (reusa o padrão da 3.4). Só owner/gerente. Auditado.
   */
  @Patch(":id/reject")
  @Roles("owner", "manager")
  async reject(
    @Param("id") id: string,
    @Body() dto: RejectPendingDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AppointmentView> {
    return this.appointments.rejectPending(id, dto.reason, user);
  }

  @Patch(":id/status")
  async changeStatus(
    @Param("id") id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AppointmentView> {
    return this.appointments.changeStatus(id, dto.to, user);
  }
}
