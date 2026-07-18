import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { SalonService } from "../../database/entities/salon-service.entity";
import { ProfessionalService } from "../../database/entities/professional-service.entity";
import { User } from "../../database/entities/user.entity";
import { Appointment } from "../../database/entities/appointment.entity";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { SalonServicesRepository } from "../services/services.repository";
import { ProfessionalSchedulesRepository } from "../schedules/schedules.repository";
import {
  addDays,
  dayOfWeekOfLocalDate,
  minutesToTime,
  timeToMinutes,
  utcToZonedParts,
  zonedWallTimeToUtc,
} from "./tz.util";
import { fitsInWindows, freeStarts, isFree, type Interval } from "./slot.util";

export interface TimeSlot {
  /** Horário de início no fuso do tenant, `HH:MM`. */
  time: string;
  /** Instante de início em UTC (ISO), para criação/comparação. */
  startUtc: string;
}

export interface DateWithSlots {
  date: string; // YYYY-MM-DD (fuso do tenant)
  slots: TimeSlot[];
}

/**
 * Por que não há horários livres num dia — para a UI diferenciar a mensagem:
 * `day_off` (o profissional não atende nesse dia), `full` (atende, mas lotado),
 * `no_schedule_config` (não há horários de atendimento configurados).
 */
export type NoSlotsReason = "day_off" | "full" | "no_schedule_config";

export interface DayAvailability {
  slots: TimeSlot[];
  /** `null` quando há slots; senão o motivo (para a mensagem da UI). */
  reason: NoSlotsReason | null;
}

/** Deriva o motivo de não haver slots a partir do estado de configuração/ocupação. */
export function noSlotsReason(flags: {
  hasAnySchedule: boolean;
  hasTodaySchedule: boolean;
}): NoSlotsReason {
  if (!flags.hasAnySchedule) return "no_schedule_config";
  if (!flags.hasTodaySchedule) return "day_off";
  return "full";
}

interface Candidate {
  id: string;
  interval: number; // slot_interval_minutes
}

/**
 * Cálculo de disponibilidade (architecture.md §4.6, Story 3.1). Cruza
 * `professional_services` + `professional_schedules` + duração do serviço +
 * `slot_interval_minutes` (buffer entre atendimentos, D4) + `appointments`
 * não-cancelados. Slot existe se ≥1 profissional que atende está livre (FR-A3).
 * Suporta `professionalId` opcional (D3): serve o manual e o bot com um motor só.
 * Respeita o `timezone` do tenant (ADR-008). Tudo tenant-scoped por `company_id`.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    // Tenant-aware (escopo automático por company_id) — também é o que o
    // guard-rail 1.3.01 detecta para exigir o TenantMiddleware neste controller.
    private readonly servicesRepo: SalonServicesRepository,
    private readonly schedulesRepo: ProfessionalSchedulesRepository,
    // Leituras cruas escopadas manualmente por company_id (queries multi-tabela /
    // range que não cabem na interface do TenantAwareRepository).
    @InjectRepository(ProfessionalService)
    private readonly profServices: Repository<ProfessionalService>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly tenant: TenantContextService,
  ) {}

  /** Horários livres de um serviço num dia (fuso do tenant). Vazio se nada disponível. */
  async getDaySlots(params: {
    serviceId: string;
    date: string;
    professionalId?: string;
  }): Promise<TimeSlot[]> {
    return (await this.getDayAvailability(params)).slots;
  }

  /**
   * Como `getDaySlots`, mas também informa o MOTIVO quando não há slots (para a UI
   * diferenciar "não atende nesse dia" × "lotado" × "sem horários configurados").
   */
  async getDayAvailability(params: {
    serviceId: string;
    date: string;
    professionalId?: string;
  }): Promise<DayAvailability> {
    const companyId = this.tenant.getCompanyId();
    const service = await this.activeService(params.serviceId);
    if (!service) return { slots: [], reason: "no_schedule_config" };
    const tz = await this.timezone(companyId);
    const candidates = await this.candidates(
      companyId,
      params.serviceId,
      params.professionalId,
    );

    const dow = dayOfWeekOfLocalDate(params.date);
    const duration = service.duration_minutes;

    // União: um minuto de início está disponível se ≥1 candidato está livre.
    // Enquanto isso, apura se algum candidato tem horário configurado (qualquer
    // dia) e horário para HOJE — para explicar o vazio quando não houver slots.
    const freeMinutes = new Set<number>();
    let hasAnySchedule = false;
    let hasTodaySchedule = false;
    for (const prof of candidates) {
      const rows = await this.schedulesRepo.findAll({
        where: { professional_id: prof.id, is_active: true },
      });
      if (rows.length > 0) hasAnySchedule = true;
      const today = rows.filter((r) => r.day_of_week === dow);
      if (today.length === 0) continue;
      hasTodaySchedule = true;
      const intervals: Interval[] = today.map((r) => ({
        start: timeToMinutes(r.start_time),
        end: timeToMinutes(r.end_time),
      }));
      const occupied = await this.occupiedIntervals(
        companyId,
        prof.id,
        params.date,
        tz,
      );
      for (const m of freeStarts(intervals, occupied, duration, prof.interval)) {
        freeMinutes.add(m);
      }
    }

    const slots = [...freeMinutes]
      .sort((a, b) => a - b)
      .map((m) => ({
        time: minutesToTime(m),
        startUtc: zonedWallTimeToUtc(params.date, m, tz).toISOString(),
      }));

    return {
      slots,
      reason:
        slots.length > 0
          ? null
          : noSlotsReason({ hasAnySchedule, hasTodaySchedule }),
    };
  }

  /**
   * Verifica se um instante específico ainda comporta o serviço. Apto a rodar
   * DENTRO de uma transação com `SELECT ... FOR UPDATE` (atomicidade da criação —
   * Story 3.3): passe `excludeAppointmentIds` com as linhas já travadas.
   */
  async hasAvailableSlot(params: {
    serviceId: string;
    scheduledAt: Date;
    professionalId?: string;
    excludeAppointmentIds?: string[];
  }): Promise<boolean> {
    const companyId = this.tenant.getCompanyId();
    const service = await this.activeService(params.serviceId);
    if (!service) return false;
    const tz = await this.timezone(companyId);
    const { dateStr, minutesOfDay } = utcToZonedParts(params.scheduledAt, tz);
    const dow = dayOfWeekOfLocalDate(dateStr);
    const candidates = await this.candidates(
      companyId,
      params.serviceId,
      params.professionalId,
    );

    for (const prof of candidates) {
      const schedules = await this.workingIntervals(prof.id, dow);
      if (schedules.length === 0) continue;
      const occupied = await this.occupiedIntervals(
        companyId,
        prof.id,
        dateStr,
        tz,
        params.excludeAppointmentIds,
      );
      if (
        fitsInWindows(minutesOfDay, service.duration_minutes, schedules) &&
        isFree(minutesOfDay, service.duration_minutes, occupied, prof.interval)
      ) {
        return true; // ≥1 profissional livre nesse exato slot
      }
    }
    return false;
  }

  /** Próximas datas com ≥1 slot, examinando `days` dias a partir de `fromDate`. */
  async getNextAvailableDates(params: {
    serviceId: string;
    fromDate: string;
    days?: number;
    professionalId?: string;
  }): Promise<DateWithSlots[]> {
    const horizon = params.days ?? 5;
    const out: DateWithSlots[] = [];
    for (let i = 0; i < horizon; i++) {
      const date = addDays(params.fromDate, i);
      const slots = await this.getDaySlots({
        serviceId: params.serviceId,
        date,
        professionalId: params.professionalId,
      });
      if (slots.length > 0) out.push({ date, slots });
    }
    return out;
  }

  // --- internos ---

  private async timezone(companyId: string): Promise<string> {
    const c = await this.companies.findOne({ where: { id: companyId } });
    return c?.timezone ?? "America/Sao_Paulo";
  }

  private async activeService(serviceId: string): Promise<SalonService | null> {
    // Tenant-scoped automaticamente (company_id do contexto).
    return this.servicesRepo.findOne({
      where: { id: serviceId, is_active: true },
    });
  }

  /** Usuários que atendem e executam o serviço (opcionalmente filtrado a um). */
  private async candidates(
    companyId: string,
    serviceId: string,
    professionalId?: string,
  ): Promise<Candidate[]> {
    const links = await this.profServices.find({
      where: { company_id: companyId, service_id: serviceId },
    });
    let ids = links.map((l) => l.professional_id);
    if (professionalId) {
      ids = ids.filter((id) => id === professionalId);
    }
    if (ids.length === 0) return [];
    const users = await this.users.find({
      where: {
        id: In(ids),
        company_id: companyId,
        attends_clients: true,
        is_active: true,
      },
    });
    return users.map((u) => ({ id: u.id, interval: u.slot_interval_minutes }));
  }

  private async workingIntervals(
    profId: string,
    dow: number,
  ): Promise<Interval[]> {
    // Tenant-scoped automaticamente (company_id do contexto).
    const rows = await this.schedulesRepo.findAll({
      where: {
        professional_id: profId,
        day_of_week: dow,
        is_active: true,
      },
    });
    return rows.map((r) => ({
      start: timeToMinutes(r.start_time),
      end: timeToMinutes(r.end_time),
    }));
  }

  /** Faixas ocupadas (minutos do dia, fuso do tenant) por appointments não-cancelados. */
  private async occupiedIntervals(
    companyId: string,
    profId: string,
    date: string,
    tz: string,
    excludeIds?: string[],
  ): Promise<Interval[]> {
    const dayStart = zonedWallTimeToUtc(date, 0, tz);
    const dayEnd = zonedWallTimeToUtc(addDays(date, 1), 0, tz);
    const qb = this.appointments
      .createQueryBuilder("a")
      .where("a.company_id = :companyId", { companyId })
      .andWhere("a.professional_id = :profId", { profId })
      .andWhere("a.is_deleted = false")
      .andWhere("a.status != :cancelled", { cancelled: "cancelled" })
      .andWhere("a.scheduled_at >= :dayStart", { dayStart })
      .andWhere("a.scheduled_at < :dayEnd", { dayEnd });
    if (excludeIds && excludeIds.length > 0) {
      qb.andWhere("a.id NOT IN (:...excludeIds)", { excludeIds });
    }
    const rows = await qb.getMany();
    return rows.map((a) => {
      const { minutesOfDay } = utcToZonedParts(a.scheduled_at, tz);
      return { start: minutesOfDay, end: minutesOfDay + a.duration_minutes };
    });
  }
}
