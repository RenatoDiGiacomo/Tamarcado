import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProfessionalSchedule } from "../../database/entities/professional-schedule.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { UsersService } from "../users/users.service";
import { ProfessionalSchedulesRepository } from "./schedules.repository";
import { SetScheduleDto } from "./dto/set-schedule.dto";

export interface ProfessionalScheduleView {
  intervalMinutes: number;
  days: ProfessionalSchedule[];
}

/** "HH:MM[:SS]" → minutos desde 00:00 (para validar fim > início). */
function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly tenantSchedules: ProfessionalSchedulesRepository,
    // Substituição da grade (delete+insert) com scoping manual por company_id.
    @InjectRepository(ProfessionalSchedule)
    private readonly schedules: Repository<ProfessionalSchedule>,
    private readonly tenantContext: TenantContextService,
    private readonly users: UsersService,
  ) {}

  /** Grade + intervalo de um profissional do tenant (AC2/AC3). 404 se não for do tenant. */
  async getForProfessional(
    professionalId: string,
  ): Promise<ProfessionalScheduleView> {
    const user = await this.users.findById(professionalId);
    if (!user) {
      throw new NotFoundException();
    }
    const days = await this.tenantSchedules.findAll({
      where: { professional_id: professionalId },
    });
    return { intervalMinutes: user.slot_interval_minutes, days };
  }

  /**
   * Substitui a grade semanal + intervalo do profissional (AC2/AC3/AC4).
   * Só profissionais do tenant com `attends_clients=true` (DL-022). Valida
   * `end_time > start_time` nos dias ativos (AC4).
   */
  async setForProfessional(
    professionalId: string,
    dto: SetScheduleDto,
  ): Promise<ProfessionalScheduleView> {
    const user = await this.users.findById(professionalId);
    if (!user) {
      throw new NotFoundException();
    }

    const attenderIds = new Set(
      (await this.users.listAttenders()).map((u) => u.id),
    );
    if (!attenderIds.has(professionalId)) {
      throw new BadRequestException(
        "Profissional não atende clientes ou está inativo",
      );
    }

    for (const day of dto.days) {
      if (day.is_active && toMinutes(day.end_time) <= toMinutes(day.start_time)) {
        throw new BadRequestException(
          `Faixa inválida no dia ${day.day_of_week}: fim deve ser após o início`,
        );
      }
    }

    const companyId = this.tenantContext.getCompanyId();

    await this.users.setSlotInterval(professionalId, dto.interval_minutes);
    await this.schedules.delete({
      company_id: companyId,
      professional_id: professionalId,
    });
    if (dto.days.length > 0) {
      await this.schedules.insert(
        dto.days.map((d) => ({
          company_id: companyId,
          professional_id: professionalId,
          day_of_week: d.day_of_week,
          start_time: d.start_time,
          end_time: d.end_time,
          is_active: d.is_active,
        })),
      );
    }

    return this.getForProfessional(professionalId);
  }
}
