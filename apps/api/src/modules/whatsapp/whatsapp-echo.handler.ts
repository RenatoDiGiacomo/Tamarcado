import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isDevEnv } from "../../app-setup";
import { WhatsAppService } from "./whatsapp.service";
import type { IncomingMessage } from "./whatsapp.provider";
import { mascararTelefone } from "./providers/cloud-api.provider";

/**
 * TRATADOR DE ECO — existe só para o **smoke test de ponta a ponta** (AC-5).
 *
 * Por que ele é código e não um script solto: o que precisa ser provado é o
 * ciclo **recebe → processa → envia** passando pelas peças reais — assinatura,
 * roteamento por número, gate de capability, factory por tenant e provider. Um
 * script que chamasse a Graph API direto provaria só que a credencial existe,
 * que é a parte fácil. Este é o maior risco técnico do épico (ordem interna do
 * Épico 6, linha 4), e ele tinha de ser derrubado **antes** da máquina de
 * conversa, não depois.
 *
 * ⚠️ **TEMPORÁRIO.** O lugar dele é ocupado pela máquina de conversa na Story
 * 6.2, e este arquivo sai junto. Até lá:
 *
 * - **desligado por padrão** — só liga com `WHATSAPP_ECHO_ENABLED=true`;
 * - **recusado fora de desenvolvimento** — um eco vivo em produção responde
 *   besteira para a cliente de um salão de verdade. A checagem é o mesmo
 *   `isDevEnv()` fail-closed do CORS: `NODE_ENV` ausente conta como produção.
 *
 * Custo do ciclo (DL-054): a resposta sai **dentro das 24h** da mensagem da
 * cliente, então é conversa de **serviço** — grátis. Provar o ciclo não gasta.
 */
@Injectable()
export class WhatsAppEchoHandler implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppEchoHandler.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>("WHATSAPP_ECHO_ENABLED") !== "true") {
      return;
    }
    if (!isDevEnv()) {
      this.logger.error(
        "WHATSAPP_ECHO_ENABLED está ligado FORA de desenvolvimento e foi " +
          "IGNORADO. O eco responderia para a cliente de um salão real. " +
          "Remova a variável do ambiente.",
      );
      return;
    }
    this.whatsapp.registerIncomingMessageHandler((mensagem) =>
      this.responder(mensagem),
    );
    this.logger.warn(
      "ECO DE SMOKE TEST LIGADO — toda mensagem recebida será respondida. " +
        "Temporário: sai na Story 6.2.",
    );
  }

  private async responder(mensagem: IncomingMessage): Promise<void> {
    const resposta = mensagem.text
      ? `Eco: ${mensagem.text}`
      : `Recebi uma mensagem do tipo "${mensagem.tipo}", que eu ainda não sei ler.`;

    this.logger.log(
      `eco: empresa=${mensagem.companyId} para=${mascararTelefone(mensagem.from)}`,
    );
    await this.whatsapp.sendMessage(
      mensagem.companyId,
      { to: mensagem.from, text: resposta },
      // O eco é o bot respondendo a cliente — consome `whatsapp_bot`, nunca
      // `lembrete_automatico`. Trocar os dois faria o smoke test passar por
      // cima do gate que ele deveria exercitar.
      "whatsapp_bot",
    );
  }
}
