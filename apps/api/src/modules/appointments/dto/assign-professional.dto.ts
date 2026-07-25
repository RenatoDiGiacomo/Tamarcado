import { IsNotEmpty, IsString, ValidateIf } from "class-validator";

/**
 * `PATCH /appointments/:id/professional` — atribuir/trocar profissional (Story 3.5).
 * `professionalId` obrigatório no corpo: uma string (id do atendente) ou `null`
 * explícito para desatribuir. Ausente → 400 (não confundir omissão com desatribuir).
 */
export class AssignProfessionalDto {
  @ValidateIf((o: AssignProfessionalDto) => o.professionalId !== null)
  @IsString()
  @IsNotEmpty()
  professionalId!: string | null;
}
