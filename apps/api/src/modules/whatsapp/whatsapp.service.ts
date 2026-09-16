import { Injectable, Logger } from "@nestjs/common";
import type { CapabilityKey } from "../../common/capabilities/capability";
import { GatedByCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import { WhatsAppProviderFactory } from "./whatsapp-provider.factory";
import { WhatsAppCapabilityMissingException } from "./whatsapp.errors";
import type {
  IncomingMessage,
  IncomingMessageHandler,
  OutgoingMessage,
  SendResult,
  WhatsAppConnectionStatus,
} from "./whatsapp.provider";

/**
 * FACHADA do canal de WhatsApp (Story 6.1). É por aqui que o resto do sistema
 * fala com o WhatsApp — ninguém injeta um provider direto.
 *
 * Três responsabilidades, e o AC-1 pede exatamente estas três coisas da
 * abstração:
 * 1. **enviar** — `sendMessage`, com o gate da camada 3 aplicado aqui;
 * 2. **estado da conexão** — `connectionStatus`, delegado ao provider do tenant;
 * 3. **registrar quem trata mensagem recebida** — `registerIncomingMessageHandler`.
 *
 * O item 3 mora na fachada e não na interface do provider porque o handler é
 * **um só para a aplicação inteira**: pendurá-lo num objeto ligado a um tenant
 * sugeriria um handler por empresa, que não existe e não deve existir.
 *
 * CAMADA 3 DO DL-072 (registrado em `CAPABILITY_GATED_ENTRYPOINTS`): este
 * caminho **não passa por requisição de usuário** — quem envia é o webhook
 * (chamado pela Meta) ou o agendador (rodando sozinho). Não há guard nenhum
 * aqui; a checagem é manual e obrigatória, e o guard-rail exige que esta classe
 * alcance o `CapabilitiesService` no grafo de DI.
 */
@GatedByCapability("whatsapp_bot")
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private handler: IncomingMessageHandler | null = null;

  constructor(
    private readonly factory: WhatsAppProviderFactory,
    private readonly capabilities: CapabilitiesService,
  ) {}

  /**
   * Registra quem trata mensagem recebida. **Um handler para a aplicação**: a
   * máquina de conversa (Story 6.2) será ele, e nesta story quem o ocupa é o eco
   * do smoke test, quando ligado.
   *
   * Substituir avisa alto. Dois handlers registrados significa que alguém
   * montou dois caminhos de tratamento e só um vai rodar — silenciosamente, o
   * outro some.
   */
  registerIncomingMessageHandler(handler: IncomingMessageHandler): void {
    if (this.handler) {
      this.logger.warn(
        "handler de mensagem recebida SUBSTITUÍDO — só o último trata mensagem",
      );
    }
    this.handler = handler;
  }

  /** `true` se alguém está tratando mensagem recebida. Diagnóstico. */
  get temHandler(): boolean {
    return this.handler !== null;
  }

  /**
   * Entrega a mensagem recebida a quem se registrou. Sem handler, registra e
   * segue — em produção isso acontece de verdade entre o deploy da 6.1 e o da
   * 6.2, e não é motivo para erro.
   *
   * **Não checa capability**: quem checa é o `WhatsAppWebhookService`, ANTES de
   * chegar aqui, porque lá é onde a decisão "empresa cortada" precisa ser
   * tomada uma vez só e registrada.
   */
  async dispatchIncoming(message: IncomingMessage): Promise<void> {
    if (!this.handler) {
      this.logger.log(
        `mensagem recebida sem handler registrado: empresa=${message.companyId} tipo=${message.tipo}`,
      );
      return;
    }
    await this.handler(message);
  }

  /**
   * Envia pela conexão **daquela empresa**, depois de conferir que ela tem o
   * direito (camada 3 do DL-072).
   *
   * `required` é PARÂMETRO OBRIGATÓRIO, sem default, de propósito: `whatsapp_bot`
   * (o bot responde) e `lembrete_automatico` (envio que o sistema inicia) são as
   * duas metades que se vendem sozinhas, e quem chama é quem sabe qual direito
   * está consumindo. Um default faria o lembrete sair para quem comprou só o bot
   * — cobrado no cartão de um cliente que não pediu aquilo.
   */
  async sendMessage(
    companyId: string,
    message: OutgoingMessage,
    required: CapabilityKey,
  ): Promise<SendResult> {
    const permitido = await this.capabilities.hasCapability(companyId, required);
    if (!permitido) {
      this.logger.warn(
        `envio bloqueado: empresa=${companyId} não tem "${required}"`,
      );
      throw new WhatsAppCapabilityMissingException(companyId, required);
    }
    const provider = await this.factory.forCompany(companyId);
    return provider.sendMessage(message);
  }

  /**
   * Estado da conexão junto ao provider. **Não é gateado por capability**:
   * conectar não é usar (DL-082), e quem pergunta o estado normalmente está
   * tentando entender por que algo não funciona — inclusive numa empresa que
   * ainda não comprou.
   */
  async connectionStatus(companyId: string): Promise<WhatsAppConnectionStatus> {
    const provider = await this.factory.forCompany(companyId);
    return provider.getConnectionStatus();
  }
}
