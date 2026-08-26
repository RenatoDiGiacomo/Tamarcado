import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";

/**
 * Canal de e-mail transacional (Brevo). Exporta só o `MailService`: quem envia
 * é quem tem o contexto da mensagem (recuperação de senha, convite de equipe),
 * não este módulo.
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
