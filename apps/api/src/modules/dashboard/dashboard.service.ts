import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { AppointmentStatus } from "../../database/entities/appointment.entity";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { addDays, utcToZonedParts, zonedWallTimeToUtc } from "../availability/tz.util";
import { DashboardRepository } from "./dashboard.repository";

/** Ponto da série de faturamento (para o gráfico de linha). */
export interface RevenuePoint {
  label: string; // "DD/MM" (diário) ou "MM/AA" (mensal)
  value: number;
}

/** Números do negócio no Dashboard (Story 5.6) — somente leitura. */
export interface DashboardMetrics {
  /** Valor bruto do período: soma dos pagamentos `pago`. */
  received: number;
  /** Ainda a receber no período: soma dos `pendente`. */
  pending: number;
  /** Quantidade de vendas: nº de pagamentos `pago` no período. */
  salesCount: number;
  /** Ticket médio: valor bruto ÷ atendimentos concluídos (0 se não houver). */
  averageTicket: number;
  /** Atendimentos concluídos no período. */
  appointmentsCompleted: number;
  /** Total de clientes cadastradas (não deletadas) — não é do período. */
  totalClients: number;
  /** Média de clientes distintas atendidas por semana no período. */
  avgClientsPerWeek: number;
  /** Faturamento (pago) ao longo do tempo — linha. */
  revenueSeries: RevenuePoint[];
  /** Atendimentos por status — pizza. */
  statusBreakdown: { status: AppointmentStatus; count: number }[];
  /** Top 5 clientes por frequência — barras horizontais. */
  topClients: { clientId: string; name: string; count: number }[];
}

/** Diferença em dias civis (inclusivo) entre duas datas YYYY-MM-DD. */
function daysInclusive(from: string, to: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(to) - d(from)) / 86_400_000) + 1;
}

/** Enumera as datas civis YYYY-MM-DD de `from` a `to` (inclusivo). */
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Enumera os meses YYYY-MM de `from` a `to` (inclusivo). */
function eachMonth(from: string, to: string): string[] {
  const out: string[] = [];
  let y = +from.slice(0, 4);
  let m = +from.slice(5, 7);
  const endY = +to.slice(0, 4);
  const endM = +to.slice(5, 7);
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
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

    const totals = await this.dashboard.paymentTotals(startUtc, endUtc);
    const { completed, distinctClients } =
      await this.dashboard.completedAndDistinctClients(startUtc, endUtc);
    const totalClients = await this.dashboard.countClients();
    const statusBreakdown = await this.dashboard.statusBreakdown(startUtc, endUtc);
    const topClients = await this.dashboard.topClients(startUtc, endUtc, 5);
    const paidRows = await this.dashboard.paidPaymentRows(startUtc, endUtc);

    const days = daysInclusive(from, to);
    const weeks = Math.max(1, days / 7);
    const avgClientsPerWeek = Math.round((distinctClients / weeks) * 10) / 10;
    const averageTicket =
      completed > 0 ? Math.round((totals.received / completed) * 100) / 100 : 0;

    // Série de faturamento: bucket diário até ~2 meses; mensal em janelas longas
    // (ex.: Ano). Preenche zeros nos buckets vazios (a linha fica contínua).
    const monthly = days > 62;
    const bucketOf = (d: Date): string => {
      const ds = utcToZonedParts(d, tz).dateStr; // YYYY-MM-DD no fuso do tenant
      return monthly ? ds.slice(0, 7) : ds;
    };
    const sums = new Map<string, number>();
    for (const r of paidRows) {
      const k = bucketOf(r.scheduledAt);
      sums.set(k, (sums.get(k) ?? 0) + r.amount);
    }
    const keys = monthly ? eachMonth(from, to) : eachDay(from, to);
    const revenueSeries: RevenuePoint[] = keys.map((k) => ({
      label: monthly
        ? `${k.slice(5, 7)}/${k.slice(2, 4)}`
        : `${k.slice(8, 10)}/${k.slice(5, 7)}`,
      value: sums.get(k) ?? 0,
    }));

    return {
      received: totals.received,
      pending: totals.pending,
      salesCount: totals.receivedCount,
      averageTicket,
      appointmentsCompleted: completed,
      totalClients,
      avgClientsPerWeek,
      revenueSeries,
      statusBreakdown,
      topClients,
    };
  }
}
