import { IsNotEmpty, IsString, MinLength } from "class-validator";

/**
 * Troca da própria senha (Perfil). Valida a senha ATUAL antes de aceitar. A
 * nova senha usa a MESMA política do aceite de convite (mín. 8 caracteres —
 * accept-invite.dto): sem regra nova.
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
