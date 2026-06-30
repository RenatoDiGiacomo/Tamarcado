import { IsNotEmpty, IsString, MinLength } from "class-validator";

/** Aceite de convite (AC1): cria a própria senha no primeiro acesso (UX-DR14). */
export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
