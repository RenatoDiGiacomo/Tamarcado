import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Appointment } from "../../database/entities/appointment.entity";
import { Client } from "../../database/entities/client.entity";
import type { PaymentStatus } from "../../database/entities/payment.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

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

  /** Soma dos pagamentos por situação (pago/pendente) no período. */
  async paymentTotals(
    startUtc: Date,
    endUtc: Date,
  ): Promise<{ received: number; pending: number }> {
    const rows = await this.repo
      .createQueryBuilder("a")
      .innerJoin(
        "payments",
        "p",
        "p.appointment_id = a.id AND p.company_id = a.company_id",
      )
      .select("p.status", "status")
      .addSelect("SUM(p.amount)", "total")
      .where("a.company_id = :companyId", { companyId: this.companyId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.scheduled_at >= :startUtc", { startUtc })
      .andWhere("a.scheduled_at < :endUtc", { endUtc })
      .groupBy("p.status")
      .getRawMany<{ status: PaymentStatus; total: string | null }>();
    const totalFor = (s: PaymentStatus): number =>
      Number(rows.find((r) => r.status === s)?.total ?? 0);
    return { received: totalFor("pago"), pending: totalFor("pendente") };
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

  /** Total de clientes cadastradas (não deletadas) do tenant — não é do período. */
  countClients(): Promise<number> {
    return this.repo.manager
      .getRepository(Client)
      .count({ where: { company_id: this.companyId, is_deleted: false } });
  }
}
