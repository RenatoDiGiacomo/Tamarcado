import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { RawAppointmentRow } from "./appointments.mapper";

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
    professionalScope?: { professionalId: string };
  }): Promise<RawAppointmentRow[]> {
    const qb = this.viewQuery()
      .andWhere("a.scheduled_at >= :startUtc", { startUtc: params.startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc: params.endUtc })
      .orderBy("a.scheduled_at", "ASC");

    if (params.professionalScope) {
      qb.andWhere(
        "(a.professional_id = :pid OR a.professional_id IS NULL)",
        { pid: params.professionalScope.professionalId },
      );
    }

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
      .select("a.id", "id")
      .addSelect("a.scheduled_at", "scheduled_at")
      .addSelect("a.duration_minutes", "duration_minutes")
      .addSelect("a.status", "status")
      .addSelect("a.source", "source")
      .addSelect("a.professional_id", "professional_id")
      .addSelect("c.name", "client_name")
      .addSelect("s.name", "service_name")
      .addSelect("u.name", "professional_name")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false");
  }
}
