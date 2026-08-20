import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import type {
  CommissionKind,
  CommissionScope,
  SalaryCadence,
  User,
} from "../../database/entities/user.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { addDays, zonedWallTimeToUtc } from "../availability/tz.util";
import { TeamRepository, type ServiceCommissionRow } from "./team.repository";
import { UpdateRemunerationDto } from "./dto/update-remuneration.dto";

export interface Remuneration {
  salaryAmount: number | null;
  salaryCadence: SalaryCadence | null;
  commissionScope: CommissionScope;
  commissionKind: CommissionKind | null;
  commissionValue: number | null;
}

export interface MemberServiceCommission {
  serviceId: string;
  serviceName: string;
  kind: CommissionKind | null;
  value: number | null;
}

/** Previsão do período: comissão (por atendimento concluído) + salário rateado. */
export interface Forecast {
  commission: number;
  salary: number;
  total: number;
}

export interface TeamMemberView {
  id: string;
  name: string;
  email: string;
  accessLevel: User["access_level"];
  attendsClients: boolean;
  isActive: boolean;
  canViewFinanceiro: boolean;
  canViewDashboard: boolean;
  canViewEquipe: boolean;
  canManageAllAppointments: boolean;
  remuneration: Remuneration;
  serviceCommissions: MemberServiceCommission[];
  forecast: Forecast;
}

function daysInclusive(from: string, to: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(to) - d(from)) / 86_400_000) + 1;
}

/** Salário fixo rateado pelo tamanho do período (decisão do Renato). */
function proratedSalary(
  amount: number | null,
  cadence: SalaryCadence | null,
  days: number,
): number {
  if (amount == null || cadence == null) return 0;
  const factor = cadence === "daily" ? days : cadence === "weekly" ? days / 7 : days / 30;
  return amount * factor;
}

/**
 * Equipe — cadastro/controle de remuneração (Story 5.9), owner-only (controller).
 * NÃO é caixa: calcula a PREVISÃO do período (comissão apurada por atendimento
 * CONCLUÍDO + salário fixo rateado). O pagamento efetivo à equipe (o "real") é
 * SAÍDA no Financeiro — próxima story (DL-061).
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly team: TeamRepository,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly tenant: TenantContextService,
  ) {}

  async list(from: string, to: string): Promise<{ members: TeamMemberView[] }> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    const tz = company?.timezone ?? "America/Sao_Paulo";
    const startUtc = zonedWallTimeToUtc(from, 0, tz);
    const endUtc = zonedWallTimeToUtc(addDays(to, 1), 0, tz);
    const days = daysInclusive(from, to);

    const [users, completed, svcRows] = await Promise.all([
      this.team.members(),
      this.team.completedAppointments(startUtc, endUtc),
      this.team.serviceCommissions(),
    ]);

    // Índices por profissional.
    const svcByProf = new Map<string, ServiceCommissionRow[]>();
    for (const r of svcRows) {
      const arr = svcByProf.get(r.professionalId) ?? [];
      arr.push(r);
      svcByProf.set(r.professionalId, arr);
    }
    const svcRate = new Map<string, ServiceCommissionRow>(); // "prof|serv" → row
    for (const r of svcRows) svcRate.set(`${r.professionalId}|${r.serviceId}`, r);
    const apptsByProf = new Map<string, typeof completed>();
    for (const a of completed) {
      const arr = apptsByProf.get(a.professionalId) ?? [];
      arr.push(a);
      apptsByProf.set(a.professionalId, arr);
    }

    const members = users.map((u): TeamMemberView => {
      const amount = u.salary_amount != null ? Number(u.salary_amount) : null;
      const commissionValue =
        u.commission_value != null ? Number(u.commission_value) : null;
      const appts = apptsByProf.get(String(u.id)) ?? [];

      let commission = 0;
      if (u.commission_scope === "professional" && u.commission_kind != null) {
        for (const a of appts) {
          commission +=
            u.commission_kind === "percent"
              ? ((commissionValue ?? 0) / 100) * (a.price ?? 0)
              : commissionValue ?? 0;
        }
      } else if (u.commission_scope === "service") {
        for (const a of appts) {
          const rate = svcRate.get(`${String(u.id)}|${a.serviceId}`);
          if (!rate || rate.kind == null || rate.value == null) continue;
          commission +=
            rate.kind === "percent"
              ? (rate.value / 100) * (a.price ?? 0)
              : rate.value;
        }
      }

      const salary = proratedSalary(amount, u.salary_cadence, days);
      const round = (n: number) => Math.round(n * 100) / 100;

      return {
        id: String(u.id),
        name: u.name,
        email: u.email,
        accessLevel: u.access_level,
        attendsClients: u.attends_clients,
        isActive: u.is_active,
        canViewFinanceiro: u.can_view_financeiro,
        canViewDashboard: u.can_view_dashboard,
        canViewEquipe: u.can_view_equipe,
        canManageAllAppointments: u.can_manage_all_appointments,
        remuneration: {
          salaryAmount: amount,
          salaryCadence: u.salary_cadence,
          commissionScope: u.commission_scope,
          commissionKind: u.commission_kind,
          commissionValue,
        },
        serviceCommissions: (svcByProf.get(String(u.id)) ?? []).map((r) => ({
          serviceId: r.serviceId,
          serviceName: r.serviceName,
          kind: r.kind,
          value: r.value,
        })),
        forecast: {
          commission: round(commission),
          salary: round(salary),
          total: round(commission + salary),
        },
      };
    });

    return { members };
  }

  /** Salva a remuneração de um membro (salário + comissão por profissional/serviço). */
  async updateRemuneration(
    id: string,
    dto: UpdateRemunerationDto,
  ): Promise<Remuneration> {
    const user = await this.team.member(id);
    if (!user) throw new NotFoundException();

    user.salary_amount =
      dto.salaryAmount != null ? dto.salaryAmount.toFixed(2) : null;
    user.salary_cadence = dto.salaryCadence ?? null;
    user.commission_scope = dto.commissionScope;
    // Tipo/valor por profissional só fazem sentido no escopo 'professional'.
    user.commission_kind =
      dto.commissionScope === "professional" ? dto.commissionKind ?? null : null;
    user.commission_value =
      dto.commissionScope === "professional" && dto.commissionValue != null
        ? dto.commissionValue.toFixed(2)
        : null;
    await this.team.saveMember(user);

    // Comissões por serviço (upsert nas linhas existentes do vínculo prof↔serviço).
    for (const sc of dto.serviceCommissions ?? []) {
      await this.team.setServiceCommission(
        id,
        sc.serviceId,
        sc.kind ?? null,
        sc.value ?? null,
      );
    }

    return {
      salaryAmount: dto.salaryAmount ?? null,
      salaryCadence: dto.salaryCadence ?? null,
      commissionScope: dto.commissionScope,
      commissionKind: user.commission_kind,
      commissionValue:
        user.commission_value != null ? Number(user.commission_value) : null,
    };
  }
}
