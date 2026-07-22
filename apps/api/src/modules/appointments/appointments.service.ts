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
import { Appointment } from "../../database/entities/appointment.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { AuthUser } from "../auth/auth-user";
import {
  addDays,
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
    private readonly tenant: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  /** Agendamentos de `[from, to]` (inclusive) + horário comercial do tenant. */
  async listByPeriod(
    from: string,
    to: string,
    user: AuthUser,
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
   * Criação manual pelo painel (AC1–AC7). `basic` cria só para si; `source=manual`,
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
    user: AuthUser,
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
   * Cancelamento pelo painel (Story 3.4). Transição de estado + rastro de autoria
   * (D1: `cancelled_by` = lado do salão; `cancelled_by_user_id` = a pessoa). Mantém
   * o registro visível (não é `is_deleted`); o slot volta aos livres porque a
   * availability já exclui `cancelled`. `basic` só cancela os próprios (AC7).
   */
  async cancel(
    id: string,
    dto: { reason?: string },
    user: AuthUser,
  ): Promise<AppointmentView> {
    const appt = await this.appointmentsRepo.findById(id);
    if (!appt) {
      throw new NotFoundException("Agendamento não encontrado.");
    }

    // Permissão (AC7): basic só cancela onde é o profissional; owner/gerente, todos.
    if (user.accessLevel === "basic" && appt.professional_id !== user.userId) {
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
