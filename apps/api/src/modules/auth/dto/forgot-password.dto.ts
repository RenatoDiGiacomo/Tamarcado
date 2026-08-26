import { IsEmail, MaxLength } from "class-validator";

/** Pedido de "esqueci minha senha" — só o e-mail; o tenant é resolvido a
 *  partir dele, como no login (DL-052). */
export class ForgotPasswordDto {
  @IsEmail({}, { message: "Informe um e-mail válido" })
  @MaxLength(255)
  email!: string;
}
