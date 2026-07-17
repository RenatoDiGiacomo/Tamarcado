import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `GET /availability` — horários livres de um serviço num dia. */
export class GetDaySlotsQueryDto {
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  // Data civil no fuso do tenant.
  @Matches(DATE_RE, { message: "date deve ser YYYY-MM-DD" })
  date!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  professionalId?: string;
}

/** `GET /availability/next-dates` — próximas datas com vaga. */
export class GetNextDatesQueryDto {
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @Matches(DATE_RE, { message: "fromDate deve ser YYYY-MM-DD" })
  fromDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  professionalId?: string;
}
