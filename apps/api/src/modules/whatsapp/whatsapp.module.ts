import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CompanyWhatsAppConnection } from "../../database/entities/company-whatsapp-connection.entity";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { WhatsAppController } from "./whatsapp.controller";
import { WhatsAppService } from "./whatsapp.service";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppProviderFactory } from "./whatsapp-provider.factory";
import { WhatsAppTokenCipher } from "./whatsapp-token.cipher";
import { WebhookSignatureAlarm } from "./webhook-signature";
import { WhatsAppEchoHandler } from "./whatsapp-echo.handler";

/**
 * Canal de WhatsApp (Story 6.1) — a primeira story do Épico 6 em que o WhatsApp
 * deixa de ser papel.
 *
 * O que ele contém, e por quê:
 * - `WhatsAppController` — o **webhook**, chamado pela Meta sem login;
 * - `WhatsAppWebhookService` — o processamento, com o gate da **camada 3**;
 * - `WhatsAppService` — a fachada: envia, diz o estado e registra o handler;
 * - `WhatsAppProviderFactory` — escolhe a implementação **por tenant** e recusa
 *   provider não oficial fora de desenvolvimento (DL-054);
 * - `WhatsAppConnectionService` + `WhatsAppTokenCipher` — as credenciais por
 *   tenant, com o token cifrado em repouso (DL-073, DL-084);
 * - `WhatsAppEchoHandler` — o eco **temporário** do smoke test (sai na 6.2).
 *
 * `CapabilitiesModule` é importado porque este é o primeiro consumidor real da
 * **camada 3** do DL-072: o webhook e (adiante) o agendador são caminhos sem
 * requisição de usuário, onde nenhum guard roda e a checagem é manual.
 *
 * NÃO exporta a factory nem o serviço de conexão: quem precisa do canal usa a
 * fachada. Exportar a factory daria a qualquer módulo um objeto capaz de enviar
 * sem passar pelo gate.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyWhatsAppConnection]),
    CapabilitiesModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppTokenCipher,
    WhatsAppConnectionService,
    WhatsAppProviderFactory,
    WhatsAppService,
    WhatsAppWebhookService,
    WebhookSignatureAlarm,
    WhatsAppEchoHandler,
  ],
  exports: [WhatsAppService, WhatsAppConnectionService],
})
export class WhatsAppModule {}
