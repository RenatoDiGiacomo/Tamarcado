import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Appointment,
  type AppointmentStatus,
} from "../../database/entities/appointment.entity";
import { Client } from "../../database/entities/client.entity";
import type { PaymentStatus } from "../../database/entities/payment.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/** Uma cliente no ranking de frequência (top N por nº de atendimentos). */
export interface TopClientRow {
  clientId: string;
  name: string;
  count: number;
}

/**
 * Acesso aos números do Dashboard (Story 5.6) escopado pelo tenant. Estende
 * `TenantAwareRepository` (base `Appointment`) — assim toda leitura carrega o
 * `company_id` do contexto e o guard-rail de multi-tenancy (DL-027) reconhece a
 * cobertura. As demais tabelas entram por join `company_id`-safe.
 */
@Injectable()
export class DashboardRepository extends TenantAwareRepository<Appointment> {
  constructor(
    @InjectRepository(Appointment) repo: Repository<Appointment>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  /** Soma e CONTAGEM dos pagamentos por situação (pago/pendente) no período. */
  async paymentTotals(
    startUtc: Date,
    endUtc: Date,
  ): Promise<{
    received: number;
    pending: number;
    receivedCount: number;
    pendingCount: number;
  }> {
    const rows = await this.repo
      .createQueryBuilder("a")
      .innerJoin(
        "payments",
        "p",
        "p.appointment_id = a.id AND p.company_id = a.company_id",
      )
      .select("p.status", "status")
      .addSelect("SUM(p.amount)", "total")
      .addSelect("COUNT(*)", "cnt")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .groupBy("p.status")
      .getRawMany<{ status: PaymentStatus; total: string | null; cnt: string }>();
    const find = (s: PaymentStatus) => rows.find((r) => r.status === s);
    return {
      received: Number(find("pago")?.total ?? 0),
      pending: Number(find("pendente")?.total ?? 0),
      receivedCount: Number(find("pago")?.cnt ?? 0),
      pendingCount: Number(find("pendente")?.cnt ?? 0),
    };
  }

  /** Atendimentos concluídos + clientes distintas atendidas no período. */
  async completedAndDistinctClients(
    startUtc: Date,
    endUtc: Date,
  ): Promise<{ completed: number; distinctClients: number }> {
    const row = await this.repo
      .createQueryBuilder("a")
      .select(
        "SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END)",
        "completed",
      )
      .addSelect("COUNT(DISTINCT a.client_id)", "distinct_clients")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .getRawOne<{ completed: string | null; distinct_clients: string | null }>();
    return {
      completed: Number(row?.completed ?? 0),
      distinctClients: Number(row?.distinct_clients ?? 0),
    };
  }

  /** Atendimentos por status no período (para a pizza). */
  async statusBreakdown(
    startUtc: Date,
    endUtc: Date,
  ): Promise<{ status: AppointmentStatus; count: number }[]> {
    const rows = await this.repo
      .createQueryBuilder("a")
      .select("a.status", "status")
      .addSelect("COUNT(*)", "cnt")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .groupBy("a.status")
      .getRawMany<{ status: AppointmentStatus; cnt: string }>();
    return rows.map((r) => ({ status: r.status, count: Number(r.cnt) }));
  }

  /** Top N clientes por FREQUÊNCIA (nº de atendimentos não deletados) no período. */
  async topClients(
    startUtc: Date,
    endUtc: Date,
    limit: number,
  ): Promise<TopClientRow[]> {
    const rows = await this.repo
      .createQueryBuilder("a")
      .innerJoin("clients", "c", "c.id = a.client_id AND c.company_id = a.company_id")
      .select("a.client_id", "client_id")
      .addSelect("c.name", "name")
      .addSelect("COUNT(*)", "cnt")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .groupBy("a.client_id")
      .addGroupBy("c.name")
      .orderBy("cnt", "DESC")
      .addOrderBy("c.name", "ASC")
      .limit(limit)
      .getRawMany<{ client_id: string; name: string | null; cnt: string }>();
    return rows.map((r) => ({
      clientId: String(r.client_id),
      name: r.name ?? "",
      count: Number(r.cnt),
    }));
  }

  /** Pagamentos `pago` do período (data + valor) — o service agrupa na série. */
  async paidPaymentRows(
    startUtc: Date,
    endUtc: Date,
  ): Promise<{ scheduledAt: Date; amount: number }[]> {
    const rows = await this.repo
      .createQueryBuilder("a")
      .innerJoin(
        "payments",
        "p",
        "p.appointment_id = a.id AND p.company_id = a.company_id",
      )
      .select("a.scheduled_at", "scheduled_at")
      .addSelect("p.amount", "amount")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("p.status = 'pago'")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .getRawMany<{ scheduled_at: Date; amount: string }>();
    return rows.map((r) => ({
      scheduledAt: r.scheduled_at,
      amount: Number(r.amount),
    }));
  }

  /** Total de clientes cadastradas (não deletadas) do tenant — não é do período. */
  countClients(): Promise<number> {
    return this.repo.manager
      .getRepository(Client)
      .count({ where: { company_id: this.companyId, is_deleted: false } });
  }
}
