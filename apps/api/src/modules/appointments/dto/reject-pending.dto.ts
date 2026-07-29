import { IsString, Matches, MaxLength } from "class-validator";

/**
 * `PATCH /appointments/:id/reject` — recusar um pendente (Story 5B.3/FR-B4).
 * Motivo OBRIGATÓRIO (o bot usa depois para notificar a cliente — FR-B5). Precisa
 * de ao menos um caractere não-branco (só espaços não vale).
 */
export class RejectPendingDto {
  @IsString()
  @Matches(/\S/, { message: "O motivo é obrigatório." })
  @MaxLength(500, { message: "O motivo deve ter no máximo 500 caracteres." })
  reason!: string;
}
