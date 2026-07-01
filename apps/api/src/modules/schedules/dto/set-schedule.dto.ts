import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

// "HH:MM" ou "HH:MM:SS" (00:00–23:59[:59]).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** Um dia da semana da grade de horários (AC2). */
export class ScheduleDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week!: number;

  @Matches(TIME_RE, { message: "start_time deve ser HH:MM" })
  start_time!: string;

  @Matches(TIME_RE, { message: "end_time deve ser HH:MM" })
  end_time!: string;

  @IsBoolean()
  is_active!: boolean;
}

/**
 * Substitui a grade semanal + o intervalo de um profissional (AC2/AC3, DL-032).
 * `interval_minutes` limitado a 0–120 (teto rejeita erro de digitação).
 */
export class SetScheduleDto {
  @IsInt()
  @Min(0)
  @Max(120)
  interval_minutes!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDayDto)
  days!: ScheduleDayDto[];
}
