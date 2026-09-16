import { Logger } from "@nestjs/common";
import type {
  OutgoingMessage,
  SendResult,
  TenantWhatsAppCredentials,
  WhatsAppConnectionStatus,
  WhatsAppProvider,
  WhatsAppProviderName,
} from "../whatsapp.provider";
import { WhatsAppDeliveryException } from "../whatsapp.errors";
import { mascararTelefone } from "./cloud-api.provider";

/**
 * Provider ALTERNATIVO — **somente desenvolvimento** (DL-054).
 *
 * ⛔ **NUNCA EM PRODUÇÃO.** APIs não oficiais vêm sendo banidas, e o número em
 * risco é o **do cliente**, não o nosso. Quem impede não é este comentário: a
 * `WhatsAppProviderFactory` **recusa** este provider quando o ambiente não é de
 * desenvolvimento, e há teste provando a recusa.
 *
 * Ele existe por duas razões concretas, nenhuma delas "caso a Meta não dê
 * certo":
 * 1. **prova que a abstração é real** (NFR-O3) — interface com uma implementação
 *    só é interface por acidente;
 * 2. permite desenvolver o bot com **número descartável**, sem queimar mensagem
 *    real nem depender da WABA do Renato para cada teste manual.
 *
 * MAPEAMENTO DE CAMPOS: a Evolution identifica o canal por **instância**, não
 * por `phone_number_id`. Nesta implementação, a coluna `phone_number_id` guarda
 * o nome da instância e `access_token` guarda a `apikey`. Reusar as colunas em
 * vez de criar um par novo é consciente: em produção só existe a Cloud API, logo
 * não há ambiguidade possível, e uma coluna a mais no schema por causa de um
 * provider de desenvolvimento seria dívida permanente por conveniência passageira.
 */
export class EvolutionApiProvider implements WhatsAppProvider {
  readonly name: WhatsAppProviderName = "evolution_api";
  private readonly logger = new Logger(EvolutionApiProvider.name);

  constructor(
    private readonly credenciais: TenantWhatsAppCredentials,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  get companyId(): string {
    return this.credenciais.companyId;
  }

  /** Nome da instância na Evolution (ver MAPEAMENTO DE CAMPOS acima). */
  private get instancia(): string {
    return this.credenciais.phoneNumberId;
  }

  async sendMessage(message: OutgoingMessage): Promise<SendResult> {
    const resposta = await this.chamar(
      `${this.baseUrl}/message/sendText/${encodeURIComponent(this.instancia)}`,
      {
        method: "POST",
        body: JSON.stringify({ number: message.to, text: message.text }),
      },
    );
    if (!resposta.ok) {
      throw new WhatsAppDeliveryException(
        this.companyId,
        `a Evolution recusou o envio (HTTP ${resposta.status})`,
      );
    }
    const corpo = (await resposta.json().catch(() => undefined)) as
      | Record<string, unknown>
      | undefined;
    const chave = corpo?.key as Record<string, unknown> | undefined;
    const id = typeof chave?.id === "string" ? chave.id : `evolution:${Date.now()}`;
    this.logger.log(
      `WhatsApp (dev) enviado: empresa=${this.companyId} para=${mascararTelefone(message.to)} id=${id}`,
    );
    return { providerMessageId: id };
  }

  async getConnectionStatus(): Promise<WhatsAppConnectionStatus> {
    try {
      const resposta = await this.chamar(
        `${this.baseUrl}/instance/connectionState/${encodeURIComponent(this.instancia)}`,
        { method: "GET" },
      );
      const corpo = (await resposta.json().catch(() => undefined)) as
        | Record<string, unknown>
        | undefined;
      const instancia = corpo?.instance as Record<string, unknown> | undefined;
      const estado = typeof instancia?.state === "string" ? instancia.state : "";
      return {
        provider: this.name,
        conectado: resposta.ok && estado === "open",
        motivo: resposta.ok ? undefined : `HTTP ${resposta.status}`,
      };
    } catch (erro) {
      return {
        provider: this.name,
        conectado: false,
        motivo: erro instanceof Error ? erro.message : String(erro),
      };
    }
  }

  private async chamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          apikey: this.credenciais.accessToken,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new WhatsAppDeliveryException(this.companyId, motivo, false);
    }
  }
}
