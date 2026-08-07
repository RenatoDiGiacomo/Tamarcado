import { IsEmail, IsString, Matches, MaxLength } from "class-validator";

/**
 * Pedido de link de redefinição de senha (1.9.01), disparado pelo operador. O
 * `slug` desambigua a empresa (e-mail é único POR empresa — DL-026); o `email`
 * identifica o usuário dentro dela.
 */
export class PasswordResetRequestDto {
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug inválido: minúsculas, números e hífens.",
  })
  slug!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;
}
