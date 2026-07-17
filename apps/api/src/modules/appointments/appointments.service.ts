import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { AuthUser } from "../auth/auth-user";
import { addDays, zonedWallTimeToUtc } from "../availability/tz.util";
import { AppointmentsRepository } from "./appointments.repository";
import {
  roleScope,
  toAppointmentView,
  type AppointmentView,
} from "./appointments.mapper";

export interface AgendaPeriod {
  appointments: AppointmentView[];
  /** Horário comercial do tenant (HH:MM), faixa da grade (D4). */
  businessHours: { start: string; end: string };
}

/**
 * Leitura da agenda (Story 3.2). Lista os agendamentos de um período (datas
 * civis no fuso do tenant → range UTC), com nomes resolvidos, filtro por papel
 * (DL-022) e o horário comercial para a grade. Somente leitura — criar/cancelar
 * são Stories 3.3/3.4.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly appointmentsRepo: AppointmentsRepository,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly tenant: TenantContextService,
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
}

/** `HH:MM:SS` (coluna TIME do MySQL) → `HH:MM`. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}
