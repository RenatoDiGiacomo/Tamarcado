import { IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * `PATCH /appointments/:id/confirm` — confirmar um pendente (Story 5B.3).
 * `professionalId` é OPCIONAL (PR-1/DL-049): confirma com ou sem atribuir.
 */
export class ConfirmPendingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  professionalId?: string;
}
