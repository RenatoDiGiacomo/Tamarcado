import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * `PATCH /appointments/:id` — edição unificada (Story 3.6). Todos os campos são
 * opcionais: aplica só os deltas informados. `professionalId` aceita `null`
 * explícito (desatribuir); ausente = não mexe. `date`/`time` andam juntos (o
 * serviço valida a combinação para recalcular `scheduled_at`).
 */
export class EditAppointmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serviceId?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: "date deve ser YYYY-MM-DD" })
  date?: string;

  @IsOptional()
  @Matches(TIME_RE, { message: "time deve ser HH:MM" })
  time?: string;

  // Presente e não-nulo → precisa ser id válido; `null` explícito desatribui.
  @ValidateIf(
    (o: EditAppointmentDto) =>
      o.professionalId !== undefined && o.professionalId !== null,
  )
  @IsString()
  @IsNotEmpty()
  professionalId?: string | null;
}
