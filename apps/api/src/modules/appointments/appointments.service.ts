import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { User } from "../../database/entities/user.entity";
import { Client } from "../../database/entities/client.entity";
import { SalonService } from "../../database/entities/salon-service.entity";
import {
  Appointment,
  type AppointmentStatus,
} from "../../database/entities/appointment.entity";
import { AppointmentChange } from "../../database/entities/appointment-change.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { Actor } from "../auth/actor.decorator";
import {
  addDays,
  minutesToTime,
  timeToMinutes,
  utcToZonedParts,
  zonedWallTimeToUtc,
} from "../availability/tz.util";
import { AppointmentsRepository } from "./appointments.repository";
import {
  roleScope,
  toAppointmentView,
  type AppointmentView,
} from "./appointments.mapper";
import {
  isPastCivilDate,
  resolveProfessionalId,
} from "./create-appointment.util";

export interface AgendaPeriod {
  appointments: AppointmentView[];
  /** Horário comercial do tenant (HH:MM), faixa da grade (D4). */
  businessHours: { start: string; end: string };
}

export interface CreatedAppointment {
  id: string;
  /** Data civil (fuso do tenant) do agendamento — a tela navega para ela. */
  date: string;
  /** True quando o slot já tinha agendamento (overbooking permitido no manual). */
  overbooked: boolean;
}

export interface AssignProfessionalResult {
  appointment: AppointmentView;
  /** True quando o novo profissional já tem atendimento sobreposto (informativo, não bloqueia — D3/D1). */
  overbooked: boolean;
}

export interface EditAppointmentInput {
  serviceId?: string;
  date?: string;
  time?: string;
  professionalId?: string | null;
}

interface CreateAtomicParams {
  clientId: string;
  serviceId: string;
  professionalId: string | null;
  scheduledAt: Date;
  createdByUserId: string;
  /** `false` (manual): conflito só avisa. `true` (bot, Épico 6): conflito → 409. */
  enforce: boolean;
}

/**
 * Agendamentos (Stories 3.2/3.3). Leitura da agenda + **criação atômica**. A
 * criação roda em transação com `SELECT ... FOR UPDATE` no profissional para
 * serializar concorrência (NFR-C1/DL-002): a máquina reutilizável que o bot
 * (Épico 6) chamará com `enforce=true`. No manual, `enforce=false` → overbooking
 * vira aviso (AC4/D1). Tudo tenant-scoped por `company_id`.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly appointmentsRepo: AppointmentsRepository,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tenant: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  /** Agendamentos de `[from, to]` (inclusive) + horário comercial do tenant. */
  async listByPeriod(
    from: string,
    to: string,
    user: Actor,
  ): Promise<AgendaPeriod> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";

    // `to` é inclusivo → o range vai até o início do dia seguinte (exclusivo).
    const startUtc = zonedWallTimeToUtc(from, 0, tz);
    const endUtc = zonedWallTimeToUtc(addDays(to, 1), 0, tz);

    const rows = await this.appointmentsRepo.findForPeriod({
      startUtc,
      endUtc,
      professionalScope: roleScope(user),
    });

    return {
      appointments: rows.map((r) => toAppointmentView(r, tz)),
      businessHours: {
        start: hhmm(company?.business_hours_start ?? "08:00:00"),
        end: hhmm(company?.business_hours_end ?? "19:00:00"),
      },
    };
  }

  /**
   * Criação manual pelo painel (AC1–AC7). quem não gerencia a equipe cria só para si; `source=manual`,
   * `status=confirmed`. Overbooking é permitido (aviso, não bloqueio) → `enforce=false`.
   */
  async createManual(
    dto: {
      client_id: string;
      service_id: string;
      professional_id?: string | null;
      date: string;
      time: string;
    },
    user: Actor,
  ): Promise<CreatedAppointment> {
    const professionalId = resolveProfessionalId(user, dto.professional_id);

    // Data/hora civis (fuso do tenant) → instante UTC. O front não conhece o
    // fuso; o backend converte com o `timezone` da empresa.
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const scheduledAt = zonedWallTimeToUtc(dto.date, timeToMinutes(dto.time), tz);

    return this.createAtomic({
      clientId: dto.client_id,
      serviceId: dto.service_id,
      professionalId,
      scheduledAt,
      createdByUserId: user.userId,
      enforce: false, // manual: overbooking vira aviso (D1)
    });
  }

  /**
   * Histórico de agendamentos de uma cliente (Story 4.2). Mais recente primeiro;
   * quem não gerencia a equipe vê só os próprios + não atribuídos (roleScope). Horário no
   * fuso do tenant. A validação de existência da cliente é do ClientsController.
   */
  async listByClient(
    clientId: string,
    user: Actor,
  ): Promise<{ appointments: AppointmentView[] }> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    // Refinamento DL-062 (2026-08-14): no histórico da cliente, o profissional
    // vê SÓ os atendimentos DELE — nem de outras, nem os não atribuídos
    // (includeUnassigned=false). Quem gerencia a equipe vê todos.
    const rows = await this.appointmentsRepo.findByClient(
      clientId,
      roleScope(user, false),
    );
    return { appointments: rows.map((r) => toAppointmentView(r, tz)) };
  }

  /**
   * Cancelamento pelo painel (Story 3.4). Transição de estado + rastro de autoria
   * (D1: `cancelled_by` = lado do salão; `cancelled_by_user_id` = a pessoa). Mantém
   * o registro visível (não é `is_deleted`); o slot volta aos livres porque a
   * availability já exclui `cancelled`. quem não gerencia a equipe só cancela os próprios.
   */
  async cancel(
    id: string,
    dto: { reason?: string },
    user: Actor,
  ): Promise<AppointmentView> {
    const appt = await this.appointmentsRepo.findById(id);
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }

    // Permissão (AC7): sem o flag, só onde é o profissional; com o flag (ou owner), todos.
    if (!user.canManageAll && appt.professional_id !== user.userId) {
      throw new ForbiddenException(
        "Você só pode cancelar seus próprios atendimentos.",
      );
    }

    // Guardas de estado.
    if (appt.status === "cancelled") {
      throw new ConflictException("Este agendamento já está cancelado.");
    }
    if (appt.status === "completed" || appt.status === "no_show") {
      throw new BadRequestException(
        "Não é possível cancelar um atendimento já encerrado.",
      );
    }

    const reason = dto.reason?.trim();
    appt.status = "cancelled";
    appt.cancellation_reason = reason && reason !== "" ? reason : null;
    appt.cancelled_by = "professional";
    appt.cancelled_by_user_id = user.userId;
    await this.appointmentsRepo.save(appt);

    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const row = await this.appointmentsRepo.findViewById(id);
    if (!row) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    return toAppointmentView(row, tz);
  }

  /**
   * Atribuir/trocar o profissional de um agendamento (Story 3.5/DL-043). Muta
   * **só** `professional_id` + auditoria (`assigned_by_user_id`/`assigned_at`) —
   * não mexe em horário/serviço/preço (é a 3.6). Só em pending/confirmed. Conflito
   * de horário do novo profissional **avisa** (`overbooked`) mas não bloqueia (D3/D1).
   * Permissão D5: owner/gerente qualquer; `basic` só atribui A SI e só quando o
   * campo está nulo (não tira de ninguém).
   */
  async assignProfessional(
    id: string,
    professionalId: string | null,
    user: Actor,
  ): Promise<AssignProfessionalResult> {
    const companyId = this.tenant.getCompanyId();
    const appt = await this.appointmentsRepo.findById(id);
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }

    // Estado (AC/API): só faz sentido em atendimentos ainda ativos.
    if (appt.status !== "pending" && appt.status !== "confirmed") {
      throw new BadRequestException(
        "Não é possível trocar o profissional de um atendimento encerrado ou cancelado.",
      );
    }

    // Permissão (D5): owner/gerente qualquer; basic só atribui A SI e só quando
    // o agendamento está sem profissional (não pode tirar de outra pessoa).
    if (!user.canManageAll) {
      const assigningSelf = professionalId === user.userId;
      const currentlyUnassigned = appt.professional_id === null;
      if (!assigningSelf || !currentlyUnassigned) {
        throw new ForbiddenException(
          "Você só pode atribuir a si mesmo um agendamento sem profissional.",
        );
      }
    }

    // Validação: profissional (quando não-nulo) precisa ser atendente ativo do
    // tenant. NÃO exige o vínculo `professional_services` (sugere, não restringe — 3.3.1).
    if (professionalId !== null) {
      const prof = await this.users.findOne({
        where: {
          id: professionalId,
          company_id: companyId,
          attends_clients: true,
          is_active: true,
        },
      });
      if (!prof) {
        throw new BadRequestException("Profissional inválido.");
      }
    }

    // Conflito é informativo (D3/D1): calcula sobreposição do NOVO profissional
    // ignorando o próprio agendamento; nunca bloqueia.
    let overbooked = false;
    if (professionalId !== null) {
      overbooked = await this.hasOverlapExcluding(
        companyId,
        professionalId,
        appt.scheduled_at,
        appt.duration_minutes,
        appt.id,
      );
    }

    appt.professional_id = professionalId;
    appt.assigned_by_user_id = user.userId;
    appt.assigned_at = new Date();
    await this.appointmentsRepo.save(appt);

    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const row = await this.appointmentsRepo.findViewById(id);
    if (!row) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    return { appointment: toAppointmentView(row, tz), overbooked };
  }

  /**
   * Edição unificada (Story 3.6/DL-044): troca serviço, horário e/ou profissional
   * juntos. Ao trocar o serviço, **re-snapshota** duração/preço. Conflito **avisa**
   * (`overbooked`) e não bloqueia (D1). Grava um **registro de alteração** por
   * campo (`appointment_changes`, DL-045) com valores legíveis (de→para). Permissão
   * D-B1: owner/gerente qualquer; `basic` edita o próprio OU assume um não atribuído,
   * e não define o profissional para terceiro. Só em pending/confirmed.
   */
  async editAppointment(
    id: string,
    dto: EditAppointmentInput,
    user: Actor,
  ): Promise<AssignProfessionalResult> {
    const companyId = this.tenant.getCompanyId();
    const appt = await this.appointmentsRepo.findById(id);
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }

    if (appt.status !== "pending" && appt.status !== "confirmed") {
      throw new BadRequestException(
        "Não é possível editar um atendimento encerrado ou cancelado.",
      );
    }

    // Permissão (D-B1): basic edita o próprio OU um não atribuído (assume p/ si);
    // não pode editar de outra pessoa já atribuída.
    if (!user.canManageAll) {
      const ownOrUnassigned =
        appt.professional_id === user.userId || appt.professional_id === null;
      if (!ownOrUnassigned) {
        throw new ForbiddenException(
          "Você só pode editar seus próprios agendamentos ou um sem profissional.",
        );
      }
    }

    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const changes: {
      field: "service" | "scheduled_at" | "professional";
      from: string | null;
      to: string | null;
    }[] = [];

    // --- Serviço (re-snapshot ao trocar) ---
    if (dto.serviceId !== undefined && dto.serviceId !== appt.service_id) {
      const svc = await this.dataSource.getRepository(SalonService).findOne({
        where: { id: dto.serviceId, company_id: companyId, is_active: true },
      });
      if (!svc) {
        throw new BadRequestException("Serviço inválido ou inativo.");
      }
      const oldSvc = await this.dataSource
        .getRepository(SalonService)
        .findOne({ where: { id: appt.service_id, company_id: companyId } });
      changes.push({
        field: "service",
        from: oldSvc?.name ?? null,
        to: svc.name,
      });
      appt.service_id = svc.id;
      appt.duration_minutes = svc.duration_minutes;
      appt.price_snapshot = svc.price ?? null;
    }

    // --- Horário (recalcula scheduled_at a partir dos deltas) ---
    const cur = utcToZonedParts(appt.scheduled_at, tz);
    const curTime = minutesToTime(cur.minutesOfDay);
    const newDate = dto.date ?? cur.dateStr;
    const newTime = dto.time ?? curTime;
    const newScheduledAt = zonedWallTimeToUtc(
      newDate,
      timeToMinutes(newTime),
      tz,
    );
    if (newScheduledAt.getTime() !== appt.scheduled_at.getTime()) {
      if (isPastCivilDate(newScheduledAt, new Date(), tz)) {
        throw new BadRequestException("A data deve ser hoje ou futura.");
      }
      changes.push({
        field: "scheduled_at",
        from: `${cur.dateStr} ${curTime}`,
        to: `${newDate} ${newTime}`,
      });
      appt.scheduled_at = newScheduledAt;
    }

    // --- Profissional ---
    if (dto.professionalId !== undefined) {
      const target = dto.professionalId;
      if (
        !user.canManageAll &&
        target !== null &&
        target !== user.userId
      ) {
        throw new ForbiddenException(
          "Você não pode atribuir o agendamento a outro profissional.",
        );
      }
      let newName: string | null = null;
      if (target !== null) {
        const prof = await this.users.findOne({
          where: {
            id: target,
            company_id: companyId,
            attends_clients: true,
            is_active: true,
          },
        });
        if (!prof) {
          throw new BadRequestException("Profissional inválido.");
        }
        newName = prof.name;
      }
      if (target !== appt.professional_id) {
        const oldName = appt.professional_id
          ? ((
              await this.users.findOne({
                where: { id: appt.professional_id, company_id: companyId },
              })
            )?.name ?? null)
          : null;
        changes.push({
          field: "professional",
          from: oldName ?? "Não atribuído",
          to: newName ?? "Não atribuído",
        });
        appt.professional_id = target;
        // Coluna de estado da 3.5 coerente com o "último a atribuir".
        appt.assigned_by_user_id = user.userId;
        appt.assigned_at = new Date();
      }
    }

    // Conflito informativo do resultado final (D1): ignora o próprio agendamento.
    let overbooked = false;
    if (appt.professional_id) {
      overbooked = await this.hasOverlapExcluding(
        companyId,
        appt.professional_id,
        appt.scheduled_at,
        appt.duration_minutes,
        appt.id,
      );
    }

    if (changes.length > 0) {
      await this.appointmentsRepo.save(appt);
      const now = new Date();
      const changeRepo = this.dataSource.getRepository(AppointmentChange);
      await changeRepo.save(
        changes.map((c) =>
          changeRepo.create({
            company_id: companyId,
            appointment_id: appt.id,
            changed_by_user_id: user.userId,
            changed_at: now,
            field: c.field,
            old_value: c.from,
            new_value: c.to,
          }),
        ),
      );
    }

    const row = await this.appointmentsRepo.findViewById(id);
    if (!row) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    return { appointment: toAppointmentView(row, tz), overbooked };
  }

  /**
   * Marcar comparecimento (Story 3.7/FR-D9): `confirmed` → `completed` ("Concluído")
   * ou `no_show` ("Não compareceu"). Ações pontuais por transição válida (não select
   * livre). Ambas exigem que o horário já tenha **começado** (`scheduled_at ≤ agora`,
   * D1/D2) — não se marca falta nem se conclui um agendamento futuro. Origem tem que
   * ser `confirmed` (terminal → 409). Permissão simétrica ao cancelamento: basic só o
   * próprio (D3). Auditoria unificada em `appointment_changes` (`field="status"`).
   * NÃO dispara pagamento (Épico 5) nem notifica a cliente (Épico 6).
   */
  async changeStatus(
    id: string,
    to: "completed" | "no_show",
    user: Actor,
  ): Promise<AppointmentView> {
    const companyId = this.tenant.getCompanyId();
    const appt = await this.appointmentsRepo.findById(id);
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }

    // Permissão (D3): sem o flag, só onde é o profissional.
    if (!user.canManageAll && appt.professional_id !== user.userId) {
      throw new ForbiddenException(
        "Você só pode marcar seus próprios atendimentos.",
      );
    }

    // Origem tem que ser confirmed; terminal/pending não transiciona por aqui.
    if (appt.status !== "confirmed") {
      throw new ConflictException(
        "Só é possível marcar comparecimento de um agendamento confirmado.",
      );
    }

    // Condição de tempo (D1/D2): o horário já começou.
    if (appt.scheduled_at.getTime() > Date.now()) {
      throw new BadRequestException(
        to === "no_show"
          ? "Não é possível marcar falta de um agendamento que ainda não começou."
          : "Não é possível concluir um agendamento que ainda não começou.",
      );
    }

    const fromLabel = statusLabel(appt.status);
    appt.status = to;
    await this.appointmentsRepo.save(appt);

    const now = new Date();
    const changeRepo = this.dataSource.getRepository(AppointmentChange);
    await changeRepo.save(
      changeRepo.create({
        company_id: companyId,
        appointment_id: appt.id,
        changed_by_user_id: user.userId,
        changed_at: now,
        field: "status",
        old_value: fromLabel,
        new_value: statusLabel(to),
      }),
    );

    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const row = await this.appointmentsRepo.findViewById(id);
    if (!row) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    return toAppointmentView(row, tz);
  }

  /**
   * Pendentes do tenant (Story 5B.3) — a fila da tela Pendentes. Recorte
   * (refinamento DL-062, 2026-08-14): quem gerencia a equipe vê todos; o
   * profissional vê **só os pendentes em que ELE é o profissional** (não
   * atribuído fica só para quem gerencia — `includeUnassigned=false`).
   */
  async listPending(user: Actor): Promise<{ appointments: AppointmentView[] }> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const rows = await this.appointmentsRepo.findPending(roleScope(user, false));
    return { appointments: rows.map((r) => toAppointmentView(r, tz)) };
  }

  /** Contagem de pendentes — MESMO recorte da listPending (o badge segue a regra). */
  async pendingCount(user: Actor): Promise<{ count: number }> {
    return {
      count: await this.appointmentsRepo.countPending(roleScope(user, false)),
    };
  }

  /**
   * Confirmar um PENDENTE (Story 5B.3/DL-046): `pending → confirmed`, atribuindo o
   * profissional **opcionalmente** (PR-1). Leva ao StatusChip "confirmado" já
   * existente (3.7). Auditoria unificada em `appointment_changes` (status e, se
   * atribuiu, profissional). Só owner/gerente (PR-3). Também disponível no modal.
   */
  async confirmPending(
    id: string,
    professionalId: string | null | undefined,
    user: Actor,
  ): Promise<AppointmentView> {
    const companyId = this.tenant.getCompanyId();
    const appt = await this.appointmentsRepo.findById(id);
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    if (!user.canManageAll) {
      throw new ForbiddenException(
        "Apenas quem gerencia a agenda de toda a equipe pode tratar pendentes.",
      );
    }
    if (appt.status !== "pending") {
      throw new ConflictException(
        "Só é possível confirmar um agendamento pendente.",
      );
    }

    const changes: { field: "status" | "professional"; from: string; to: string }[] = [];

    // Profissional OPCIONAL: quando informado, precisa ser atendente ativo do tenant.
    if (professionalId != null) {
      const prof = await this.users.findOne({
        where: {
          id: professionalId,
          company_id: companyId,
          attends_clients: true,
          is_active: true,
        },
      });
      if (!prof) {
        throw new BadRequestException("Profissional inválido.");
      }
      if (appt.professional_id !== professionalId) {
        const oldName = appt.professional_id
          ? ((
              await this.users.findOne({
                where: { id: appt.professional_id, company_id: companyId },
              })
            )?.name ?? null)
          : null;
        changes.push({
          field: "professional",
          from: oldName ?? "Não atribuído",
          to: prof.name,
        });
        appt.professional_id = professionalId;
        appt.assigned_by_user_id = user.userId;
        appt.assigned_at = new Date();
      }
    }

    changes.push({
      field: "status",
      from: statusLabel(appt.status),
      to: statusLabel("confirmed"),
    });
    appt.status = "confirmed";
    await this.appointmentsRepo.save(appt);

    const now = new Date();
    const changeRepo = this.dataSource.getRepository(AppointmentChange);
    await changeRepo.save(
      changes.map((c) =>
        changeRepo.create({
          company_id: companyId,
          appointment_id: appt.id,
          changed_by_user_id: user.userId,
          changed_at: now,
          field: c.field,
          old_value: c.from,
          new_value: c.to,
        }),
      ),
    );

    return this.viewOrThrow(id, companyId);
  }

  /**
   * Recusar um PENDENTE (Story 5B.3/FR-B4): `pending → cancelled` com motivo
   * OBRIGATÓRIO. Reusa o padrão de cancelamento (3.4: `cancelled_by` = lado do
   * estabelecimento + `cancelled_by_user_id` = a pessoa + `cancellation_reason`)
   * e audita em `appointment_changes`. O motivo é o que o bot usa depois (FR-B5).
   * Só owner/gerente (PR-3).
   */
  async rejectPending(
    id: string,
    reason: string,
    user: Actor,
  ): Promise<AppointmentView> {
    const companyId = this.tenant.getCompanyId();
    const appt = await this.appointmentsRepo.findById(id);
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    if (!user.canManageAll) {
      throw new ForbiddenException(
        "Apenas quem gerencia a agenda de toda a equipe pode tratar pendentes.",
      );
    }
    if (appt.status !== "pending") {
      throw new ConflictException(
        "Só é possível recusar um agendamento pendente.",
      );
    }

    const fromLabel = statusLabel(appt.status);
    appt.status = "cancelled";
    appt.cancellation_reason = reason.trim();
    appt.cancelled_by = "professional";
    appt.cancelled_by_user_id = user.userId;
    await this.appointmentsRepo.save(appt);

    const changeRepo = this.dataSource.getRepository(AppointmentChange);
    await changeRepo.save(
      changeRepo.create({
        company_id: companyId,
        appointment_id: appt.id,
        changed_by_user_id: user.userId,
        changed_at: new Date(),
        field: "status",
        old_value: fromLabel,
        new_value: statusLabel("cancelled"),
      }),
    );

    return this.viewOrThrow(id, companyId);
  }

  /** View do agendamento no fuso do tenant, ou 404. */
  private async viewOrThrow(
    id: string,
    companyId: string,
  ): Promise<AppointmentView> {
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const row = await this.appointmentsRepo.findViewById(id);
    if (!row) {
      throw new NotFoundException("Agendamento não encontrado.");
    }
    return toAppointmentView(row, tz);
  }

  /**
   * Núcleo transacional (NFR-C1/DL-002). Serializa por profissional com
   * `SELECT ... FOR UPDATE` (a T2 só passa após a T1 commitar, enxergando a linha
   * já gravada). `enforce=true` rejeita conflito (409) — pronto para o bot.
   */
  async createAtomic(params: CreateAtomicParams): Promise<CreatedAppointment> {
    const companyId = this.tenant.getCompanyId();

    return this.dataSource.transaction(async (manager) => {
      const tz = await this.timezone(manager, companyId);

      // Regra de negócio: data hoje-ou-futura (AC4).
      if (isPastCivilDate(params.scheduledAt, new Date(), tz)) {
        throw new BadRequestException("A data deve ser hoje ou futura.");
      }

      // Serviço ativo do tenant → snapshots de duração/preço (D5/DL-030).
      const service = await manager.getRepository(SalonService).findOne({
        where: { id: params.serviceId, company_id: companyId, is_active: true },
      });
      if (!service) {
        throw new BadRequestException("Serviço inválido ou inativo.");
      }

      const client = await manager.getRepository(Client).findOne({
        where: { id: params.clientId, company_id: companyId, is_deleted: false },
      });
      if (!client) {
        throw new BadRequestException("Cliente inválido.");
      }

      // Trava de serialização + checagem de conflito só quando há profissional
      // definido (não atribuído não disputa a agenda de ninguém).
      let overbooked = false;
      if (params.professionalId) {
        await this.assertProfessional(manager, companyId, params.professionalId);
        // FOR UPDATE no profissional: serializa criações concorrentes para ele.
        await manager
          .getRepository(User)
          .createQueryBuilder("u")
          .setLock("pessimistic_write")
          .where("u.id = :id AND u.company_id = :companyId", {
            id: params.professionalId,
            companyId,
          })
          .getOne();

        overbooked = await this.hasOverlap(
          manager,
          companyId,
          params.professionalId,
          params.scheduledAt,
          service.duration_minutes,
        );
        if (params.enforce && overbooked) {
          throw new ConflictException("Horário já ocupado para o profissional.");
        }
      }

      const saved = await manager.getRepository(Appointment).save(
        manager.getRepository(Appointment).create({
          company_id: companyId,
          client_id: client.id,
          service_id: service.id,
          professional_id: params.professionalId,
          scheduled_at: params.scheduledAt,
          duration_minutes: service.duration_minutes,
          price_snapshot: service.price ?? null,
          status: "confirmed",
          source: "manual",
          created_by_user_id: params.createdByUserId,
        }),
      );

      return {
        id: String(saved.id),
        date: utcToZonedParts(params.scheduledAt, tz).dateStr,
        overbooked,
      };
    });
  }

  // --- internos ---

  private async timezone(
    manager: EntityManager,
    companyId: string,
  ): Promise<string> {
    const c = await manager
      .getRepository(Company)
      .findOne({ where: { id: companyId } });
    return c?.timezone ?? "America/Sao_Paulo";
  }

  /**
   * Valida que o profissional é um atendente válido do tenant (existe, atende
   * clientes, ativo). NÃO exige o vínculo `professional_services`: no manual o
   * dono escolhe o profissional deliberadamente (encaixe/walk-in), e a D1 diz que
   * o manual nunca bloqueia (4xx) — o vínculo governa só a SUGESTÃO de horários
   * (AvailabilityService), não a criação manual.
   */
  private async assertProfessional(
    manager: EntityManager,
    companyId: string,
    professionalId: string,
  ): Promise<void> {
    const prof = await manager.getRepository(User).findOne({
      where: {
        id: professionalId,
        company_id: companyId,
        attends_clients: true,
        is_active: true,
      },
    });
    if (!prof) {
      throw new BadRequestException("Profissional inválido.");
    }
  }

  /**
   * Sobreposição informativa (Story 3.5, D3): há OUTRO agendamento não-cancelado
   * do profissional cobrindo `[start, start+dur)`, ignorando `excludeId` (o próprio
   * que está sendo reatribuído)? Sem lock — o resultado só alimenta o aviso, não
   * decide transação.
   */
  private async hasOverlapExcluding(
    companyId: string,
    professionalId: string,
    start: Date,
    durationMinutes: number,
    excludeId: string,
  ): Promise<boolean> {
    const end = new Date(start.getTime() + durationMinutes * 60000);
    const count = await this.dataSource
      .getRepository(Appointment)
      .createQueryBuilder("a")
      .where("a.company_id = :companyId", { companyId })
      .andWhere("a.professional_id = :pid", { pid: professionalId })
      .andWhere("a.id != :excludeId", { excludeId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.status != :cancelled", { cancelled: "cancelled" })
      .andWhere("a.scheduled_at < :end", { end })
      .andWhere(
        "DATE_ADD(a.scheduled_at, INTERVAL a.duration_minutes MINUTE) > :start",
        { start },
      )
      .getCount();
    return count > 0;
  }

  /**
   * Há agendamento não-cancelado do profissional sobrepondo `[start, start+dur)`?
   * Leitura com bloqueio (vê o dado já commitado da transação anterior).
   */
  private async hasOverlap(
    manager: EntityManager,
    companyId: string,
    professionalId: string,
    start: Date,
    durationMinutes: number,
  ): Promise<boolean> {
    const end = new Date(start.getTime() + durationMinutes * 60000);
    const count = await manager
      .getRepository(Appointment)
      .createQueryBuilder("a")
      .setLock("pessimistic_write")
      .where("a.company_id = :companyId", { companyId })
      .andWhere("a.professional_id = :pid", { pid: professionalId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.status != :cancelled", { cancelled: "cancelled" })
      .andWhere("a.scheduled_at < :end", { end })
      .andWhere(
        "DATE_ADD(a.scheduled_at, INTERVAL a.duration_minutes MINUTE) > :start",
        { start },
      )
      .getCount();
    return count > 0;
  }
}

/** `HH:MM:SS` (coluna TIME do MySQL) → `HH:MM`. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** Rótulo legível do status para o histórico de alteração (Story 3.7). */
function statusLabel(status: AppointmentStatus): string {
  const labels: Record<AppointmentStatus, string> = {
    pending: "Aguardando confirmação",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
    completed: "Concluído",
    no_show: "Não compareceu",
  };
  return labels[status];
}
