import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type {
  ProfessionalScope,
  RawAppointmentRow,
} from "./appointments.mapper";

/**
 * Aplica o recorte por profissional a um QB (alias `a`): `= self` sempre; e
 * `OR IS NULL` só quando `includeUnassigned`. `undefined` = sem recorte (quem
 * gerencia a equipe).
 */
function applyProfessionalScope(
  qb: SelectQueryBuilder<Appointment>,
  scope?: ProfessionalScope,
): void {
  if (!scope) return;
  if (scope.includeUnassigned) {
    qb.andWhere("(a.professional_id = :pid OR a.professional_id IS NULL)", {
      pid: scope.professionalId,
    });
  } else {
    qb.andWhere("a.professional_id = :pid", { pid: scope.professionalId });
  }
}

/**
 * Acesso aos agendamentos escopado pelo tenant atual (NFR-S1). A listagem da
 * agenda cruza clients/salon_services/users para resolver os nomes; o join é
 * `company_id`-safe (cada tabela casa pelo próprio tenant). Sempre filtra o
 * `company_id` do contexto — nenhuma linha de outro tenant escapa.
 */
@Injectable()
export class AppointmentsRepository extends TenantAwareRepository<Appointment> {
  constructor(
    @InjectRepository(Appointment) repo: Repository<Appointment>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  /**
   * Agendamentos não deletados do período `[startUtc, endUtc)`, com nomes
   * resolvidos, ordenados por horário. `professionalScope` aplica o recorte por
   * papel (DL-022): quando presente, só os do profissional + os não atribuídos.
   */
  async findForPeriod(params: {
    startUtc: Date;
    endUtc: Date;
    professionalScope?: ProfessionalScope;
  }): Promise<RawAppointmentRow[]> {
    const qb = this.viewQuery()
      .andWhere("a.scheduled_at >= :startUtc", { startUtc: params.startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc: params.endUtc })
      .orderBy("a.scheduled_at", "ASC");

    applyProfessionalScope(qb, params.professionalScope);

    return qb.getRawMany<RawAppointmentRow>();
  }

  /** Um agendamento (do tenant) já na forma da view — usado após o cancelamento. */
  async findViewById(id: string): Promise<RawAppointmentRow | null> {
    const row = await this.viewQuery()
      .andWhere("a.id = :id", { id })
      .getRawOne<RawAppointmentRow>();
    return row ?? null;
  }

  /**
   * Histórico de uma cliente (Story 4.2) — todos os agendamentos dela no tenant,
   * mais recente primeiro. `professionalScope` aplica o recorte por papel (DL-022):
   * `basic` vê só os próprios + não atribuídos.
   */
  async findByClient(
    clientId: string,
    professionalScope?: ProfessionalScope,
  ): Promise<RawAppointmentRow[]> {
    const qb = this.viewQuery()
      .andWhere("a.client_id = :clientId", { clientId })
      .orderBy("a.scheduled_at", "DESC");
    applyProfessionalScope(qb, professionalScope);
    return qb.getRawMany<RawAppointmentRow>();
  }

  /**
   * Pendentes do tenant (Story 5B.3) — `status = pending`, mais antigo primeiro
   * (fila de chegada). Recorte por papel (refinamento DL-062, 2026-08-14): quem
   * gerencia a equipe vê todos; o profissional vê **só os seus** (não atribuído
   * NÃO entra — `includeUnassigned=false`).
   */
  async findPending(
    professionalScope?: ProfessionalScope,
  ): Promise<RawAppointmentRow[]> {
    const qb = this.viewQuery()
      .andWhere("a.status = :pending", { pending: "pending" })
      .orderBy("a.scheduled_at", "ASC");
    applyProfessionalScope(qb, professionalScope);
    return qb.getRawMany<RawAppointmentRow>();
  }

  /** Contagem de pendentes (Story 5B.3) — mesmo recorte da `findPending`. */
  async countPending(professionalScope?: ProfessionalScope): Promise<number> {
    const qb = this.repo
      .createQueryBuilder("a")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.status = :pending", { pending: "pending" });
    applyProfessionalScope(qb, professionalScope);
    return qb.getCount();
  }

  /**
   * Base da view da agenda: joins tenant-safe + nomes resolvidos, já filtrando o
   * `company_id` do contexto e `is_deleted = false`. Quem chama adiciona o recorte
   * (período/id/escopo).
   */
  private viewQuery(): SelectQueryBuilder<Appointment> {
    return this.repo
      .createQueryBuilder("a")
      .leftJoin(
        "clients",
        "c",
        "c.id = a.client_id AND c.company_id = a.company_id",
      )
      .leftJoin(
        "salon_services",
        "s",
        "s.id = a.service_id AND s.company_id = a.company_id",
      )
      .leftJoin(
        "users",
        "u",
        "u.id = a.professional_id AND u.company_id = a.company_id",
      )
      // Pagamento (Story 5.2) — 0 ou 1 por agendamento (unique). Sempre no join;
      // o mapper só EXPÕE o valor para quem tem Financeiro (`includePayment`).
      .leftJoin(
        "payments",
        "p",
        "p.appointment_id = a.id AND p.company_id = a.company_id",
      )
      .select("a.id", "id")
      .addSelect("a.client_id", "client_id")
      .addSelect("a.scheduled_at", "scheduled_at")
      .addSelect("a.duration_minutes", "duration_minutes")
      .addSelect("a.status", "status")
      .addSelect("a.source", "source")
      .addSelect("a.service_id", "service_id")
      .addSelect("a.professional_id", "professional_id")
      .addSelect("c.name", "client_name")
      .addSelect("s.name", "service_name")
      .addSelect("u.name", "professional_name")
      .addSelect("a.price_snapshot", "price_snapshot")
      .addSelect("p.status", "payment_status")
      .addSelect("p.amount", "payment_amount")
      .addSelect("p.method", "payment_method")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false");
  }
}
