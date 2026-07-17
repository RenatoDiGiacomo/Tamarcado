import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** `POST /appointments` — criação manual (Story 3.3). Data/hora civis (fuso do tenant). */
export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  client_id!: string;

  @IsString()
  @IsNotEmpty()
  service_id!: string;

  // Não atribuído = null/omitido. Para `basic` é ignorado (força self).
  @IsOptional()
  @IsString()
  professional_id?: string | null;

  @Matches(DATE_RE, { message: "date deve ser YYYY-MM-DD" })
  date!: string;

  @Matches(TIME_RE, { message: "time deve ser HH:MM" })
  time!: string;
}
