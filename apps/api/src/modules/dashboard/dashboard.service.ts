import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { addDays, zonedWallTimeToUtc } from "../availability/tz.util";
import { DashboardRepository } from "./dashboard.repository";

/** Números do negócio no Dashboard (Story 5.6) — somente leitura. */
export interface DashboardMetrics {
  /** Faturamento do período: soma dos pagamentos `pago`. */
  received: number;
  /** Ainda a receber no período: soma dos `pendente`. */
  pending: number;
  /** Atendimentos concluídos no período. */
  appointmentsCompleted: number;
  /** Total de clientes cadastradas (não deletadas) — não é do período. */
  totalClients: number;
  /** Média de clientes distintas atendidas por semana no período. */
  avgClientsPerWeek: number;
}

/**
 * Dashboard (Story 5.6) — consolida os números do negócio, SOMENTE LEITURA. É
 * dado de VALOR: o controller gateia por `@RequireModule('dashboard')` (403 para
 * quem não tem o interruptor). Reaproveita a noção de período (fuso do tenant,
 * `to` inclusivo) do Financeiro; as queries vivem no DashboardRepository (tenant-safe).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboard: DashboardRepository,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly tenant: TenantContextService,
  ) {}

  async metrics(from: string, to: string): Promise<DashboardMetrics> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const startUtc = zonedWallTimeToUtc(from, 0, tz);
    const endUtc = zonedWallTimeToUtc(addDays(to, 1), 0, tz); // `to` inclusivo

    const { received, pending } = await this.dashboard.paymentTotals(
      startUtc,
      endUtc,
    );
    const { completed, distinctClients } =
      await this.dashboard.completedAndDistinctClients(startUtc, endUtc);
    const totalClients = await this.dashboard.countClients();

    // Semanas do período (>= 1), a partir do intervalo civil inclusivo.
    const days = Math.round((endUtc.getTime() - startUtc.getTime()) / 86_400_000);
    const weeks = Math.max(1, days / 7);
    const avgClientsPerWeek = Math.round((distinctClients / weeks) * 10) / 10;

    return {
      received,
      pending,
      appointmentsCompleted: completed,
      totalClients,
      avgClientsPerWeek,
    };
  }
}
