import { IsOptional, IsString, MaxLength } from "class-validator";

/** `PATCH /appointments/:id/cancel` — cancelamento pelo painel (Story 3.4). */
export class CancelAppointmentDto {
  /** Motivo opcional → `cancellation_reason`. Vazio/omitido = `null`. */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "O motivo deve ter no máximo 500 caracteres." })
  reason?: string;
}
