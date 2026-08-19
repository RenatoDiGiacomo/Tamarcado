import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModuleGuard } from "../auth/guards/module.guard";
import { RequireModule } from "../../common/decorators/require-module.decorator";
import { CurrentActor, type Actor } from "../auth/actor.decorator";
import {
  PaymentsService,
  type PaymentView,
  type ReceiptsView,
} from "./payments.service";
import { RegisterPaymentDto } from "./dto/register-payment.dto";
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
@UseGuards(JwtAuthGuard, ActiveUserGuard, ModuleGuard, RolesGuard)
@Controller("appointments")
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly payments: PaymentsService,
  ) {}

  /** Agendamentos do período (`?from&to`, datas civis) + horário comercial. */
  @Get()
  async list(
    @Query() q: ListAppointmentsQueryDto,
    @CurrentActor() actor: Actor,
  ): Promise<AgendaPeriod> {
    return this.appointments.listByPeriod(q.from, q.to, actor);
  }

  /**
   * Pendentes do tenant (Story 5B.3) — a fila da tela Pendentes. **Escopado**
   * (refinamento DL-062, 2026-08-14): quem gerencia a equipe vê todos; o
   * profissional vê **só os seus** (o service aplica o recorte por `@Actor`). Por
   * isso NÃO há mais gate de acesso aqui — todo autenticado lista, filtrado.
   */
  @Get("pending")
  async listPending(
    @CurrentActor() actor: Actor,
  ): Promise<{ appointments: AppointmentView[] }> {
    return this.appointments.listPending(actor);
  }

  /** Contagem de pendentes (Story 5B.3) — o contador/badge, MESMO recorte. */
  @Get("pending-count")
  async pendingCount(
    @CurrentActor() actor: Actor,
  ): Promise<{ count: number }> {
    return this.appointments.pendingCount(actor);
  }

  /**
   * Recebimentos do período (Story 5.3) — a lista do menu Financeiro, com total
   * recebido e total pendente. **Exige o módulo Financeiro** (`ModuleGuard`).
   * Antes de `@Get(":id")` (não há), mas por segurança fica entre os GETs fixos.
   */
  @Get("payments")
  @RequireModule("financeiro")
  async receipts(
    @Query() q: ListAppointmentsQueryDto,
  ): Promise<ReceiptsView> {
    return this.payments.listReceipts(q.from, q.to);
  }

  /**
   * Cria um agendamento manual (Story 3.3). `source=manual`, `status=confirmed`;
   * `basic` cria só para si. Slot ocupado NÃO bloqueia (retorna `overbooked`).
   */
  @Post()
  async create(
    @Body() dto: CreateAppointmentDto,
    @CurrentActor() actor: Actor,
  ): Promise<CreatedAppointment> {
    return this.appointments.createManual(dto, actor);
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
    @CurrentActor() actor: Actor,
  ): Promise<AppointmentView> {
    return this.appointments.cancel(id, dto, actor);
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
    @CurrentActor() actor: Actor,
  ): Promise<AssignProfessionalResult> {
    return this.appointments.assignProfessional(id, dto.professionalId, actor);
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
    @CurrentActor() actor: Actor,
  ): Promise<AssignProfessionalResult> {
    return this.appointments.editAppointment(id, dto, actor);
  }

  /**
   * Marca comparecimento (Story 3.7/FR-D9): `confirmed` → `completed`/`no_show`.
   * Ações pontuais por transição válida; exige o horário já ter começado (D1/D2);
   * basic só o próprio (D3). Auditoria em `appointment_changes`. Sem notificação.
   */
  /**
   * Confirma um PENDENTE (Story 5B.3/DL-046): `pending → confirmed`, atribuindo o
   * profissional OPCIONALMENTE (PR-1). Leva ao badge "confirmado" da 3.7. Só
   * quem gerencia a equipe, ou o Profissional no pendente DELE (DL-062). Auditado. Também no modal.
   */
  @Patch(":id/confirm")
  @Roles("owner", "professional")
  async confirm(
    @Param("id") id: string,
    @Body() dto: ConfirmPendingDto,
    @CurrentActor() actor: Actor,
  ): Promise<AppointmentView> {
    return this.appointments.confirmPending(id, dto.professionalId, actor);
  }

  /**
   * Recusa um PENDENTE (Story 5B.3/FR-B4): `pending → cancelled` com motivo
   * OBRIGATÓRIO (reusa o padrão da 3.4). Quem gerencia a equipe, ou o Profissional no pendente DELE (DL-062). Auditado.
   */
  @Patch(":id/reject")
  @Roles("owner", "professional")
  async reject(
    @Param("id") id: string,
    @Body() dto: RejectPendingDto,
    @CurrentActor() actor: Actor,
  ): Promise<AppointmentView> {
    return this.appointments.rejectPending(id, dto.reason, actor);
  }

  /**
   * Registra (upsert) o PAGAMENTO de um agendamento (Story 5.2). Acontece a
   * partir do próprio agendamento; **exige o módulo Financeiro** (`ModuleGuard`)
   * → quem não tem recebe **403** (e não vê o menu). `valor` obrigatório, `forma`
   * opcional, `situação` pago/pendente. Não mexe no status do agendamento.
   */
  @Put(":id/payment")
  @RequireModule("financeiro")
  async registerPayment(
    @Param("id") id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentActor() actor: Actor,
  ): Promise<PaymentView> {
    return this.payments.register(id, dto, actor);
  }

  @Patch(":id/status")
  async changeStatus(
    @Param("id") id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentActor() actor: Actor,
  ): Promise<AppointmentView> {
    return this.appointments.changeStatus(id, dto.to, actor);
  }
}
