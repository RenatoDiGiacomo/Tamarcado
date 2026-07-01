import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ActiveUserGuard } from "../auth/guards/active-user.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ProfessionalSchedule } from "../../database/entities/professional-schedule.entity";
import { SchedulesService } from "./schedules.service";
import { SetScheduleDto } from "./dto/set-schedule.dto";

interface ScheduleDayView {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface ScheduleView {
  professionalId: string;
  intervalMinutes: number;
  days: ScheduleDayView[];
}

function toDayView(s: ProfessionalSchedule): ScheduleDayView {
  return {
    dayOfWeek: s.day_of_week,
    startTime: s.start_time,
    endTime: s.end_time,
    isActive: s.is_active,
  };
}

// Tenant-aware: registrado em TENANT_AWARE_CONTROLLERS (guard-rail 1.3.01).
// Config de horários/intervalo é owner-only (matriz FR-I2).
@ApiTags("schedules")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)
@Controller("schedules")
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  /** Grade semanal + intervalo de um profissional (tenant-scoped; 404 se fora). */
  @Get(":professionalId")
  async get(
    @Param("professionalId") professionalId: string,
  ): Promise<ScheduleView> {
    const view = await this.schedules.getForProfessional(professionalId);
    return {
      professionalId,
      intervalMinutes: view.intervalMinutes,
      days: view.days.map(toDayView),
    };
  }

  /** Substitui a grade semanal + intervalo (AC2/AC3/AC4). Somente Dono. */
  @Put(":professionalId")
  @Roles("owner")
  async set(
    @Param("professionalId") professionalId: string,
    @Body() dto: SetScheduleDto,
  ): Promise<ScheduleView> {
    const view = await this.schedules.setForProfessional(professionalId, dto);
    return {
      professionalId,
      intervalMinutes: view.intervalMinutes,
      days: view.days.map(toDayView),
    };
  }
}
