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

/** Endpoint e versão da Graph API. Configuráveis para não depender de deploy. */
export interface CloudApiConfig {
  baseUrl: string;
  version: string;
  timeoutMs: number;
}

/**
 * Implementação oficial — **WhatsApp Cloud API da Meta** (DL-054). É a única
 * permitida em produção; a factory recusa qualquer outra fora de dev.
 *
 * LIGADA A UM TENANT: as credenciais entram no construtor. Não existe caminho
 * para enviar pela empresa A com o token da empresa B, e isso é garantia de
 * CONSTRUÇÃO, não de revisão de código.
 *
 * O TOKEN NUNCA APARECE: não em log, não em mensagem de erro, não truncado. A
 * Graph API devolve o corpo do erro com bastante detalhe — e é justamente o que
 * costuma trazer eco de credencial —, então o corpo é lido, **classificado** e
 * registrado por categoria, nunca copiado inteiro para o log.
 *
 * `fetch` nativo (Node 20), como no `MailService`: nenhuma dependência nova, sai
 * na 443 e tem timeout nosso.
 */
export class CloudApiProvider implements WhatsAppProvider {
  readonly name: WhatsAppProviderName = "cloud_api";
  private readonly logger = new Logger(CloudApiProvider.name);

  constructor(
    private readonly credenciais: TenantWhatsAppCredentials,
    private readonly config: CloudApiConfig,
  ) {}

  get companyId(): string {
    return this.credenciais.companyId;
  }

  async sendMessage(message: OutgoingMessage): Promise<SendResult> {
    const url = this.url(`${this.credenciais.phoneNumberId}/messages`);
    const resposta = await this.chamar(url, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: message.to,
        type: "text",
        // `preview_url: false` impede que um link no texto vire cartão de
        // pré-visualização — o bot manda horário e confirmação, não link rico.
        text: { preview_url: false, body: message.text },
      }),
    });

    const corpo = await this.corpo(resposta);
    if (!resposta.ok) {
      const { motivo, permanente } = classificarErro(resposta.status, corpo);
      this.logger.error(
        `Cloud API recusou o envio: empresa=${this.companyId} ` +
          `phone_number_id=${this.credenciais.phoneNumberId} ` +
          `status=${resposta.status} motivo=${motivo}`,
      );
      throw new WhatsAppDeliveryException(this.companyId, motivo, permanente);
    }

    const id = primeiroIdDeMensagem(corpo);
    if (!id) {
      // 200 sem `messages[0].id` não deveria acontecer. Se acontecer, tratar
      // como entregue seria inventar um identificador que a 6.20 vai usar como
      // chave — melhor falhar aqui.
      throw new WhatsAppDeliveryException(
        this.companyId,
        "a Meta respondeu sem o identificador da mensagem",
      );
    }

    this.logger.log(
      `WhatsApp enviado: empresa=${this.companyId} para=${mascararTelefone(message.to)} id=${id}`,
    );
    return { providerMessageId: id };
  }

  async getConnectionStatus(): Promise<WhatsAppConnectionStatus> {
    const url = this.url(
      `${this.credenciais.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    );
    try {
      const resposta = await this.chamar(url, { method: "GET" });
      const corpo = await this.corpo(resposta);
      if (!resposta.ok) {
        const { motivo } = classificarErro(resposta.status, corpo);
        return { provider: this.name, conectado: false, motivo };
      }
      return {
        provider: this.name,
        conectado: true,
        displayPhoneNumber: texto(corpo?.display_phone_number),
        nomeExibicao: texto(corpo?.verified_name),
        qualidade: texto(corpo?.quality_rating),
      };
    } catch (erro) {
      // Estado da conexão é DIAGNÓSTICO: não lança, informa. Quem pergunta o
      // estado está justamente tentando entender por que não funciona.
      return {
        provider: this.name,
        conectado: false,
        motivo: erro instanceof Error ? erro.message : String(erro),
      };
    }
  }

  private url(caminho: string): string {
    return `${this.config.baseUrl}/${this.config.version}/${caminho}`;
  }

  private async chamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          authorization: `Bearer ${this.credenciais.accessToken}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (erro) {
      // Rede fora, DNS, timeout: TEMPORÁRIO. Repetir faz sentido — e é a 6.20
      // que vai repetir, pela tabela de entrada.
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new WhatsAppDeliveryException(this.companyId, motivo, false);
    }
  }

  private async corpo(
    resposta: Response,
  ): Promise<Record<string, unknown> | undefined> {
    try {
      const bruto: unknown = await resposta.json();
      return typeof bruto === "object" && bruto !== null
        ? (bruto as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

function primeiroIdDeMensagem(
  corpo: Record<string, unknown> | undefined,
): string | undefined {
  const mensagens = corpo?.messages;
  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    return undefined;
  }
  const primeira = mensagens[0] as Record<string, unknown> | undefined;
  return texto(primeira?.id);
}

/**
 * Telefone da CLIENTE FINAL em log: guardado parcialmente. O dado é dela, não
 * nosso (somos OPERADOR — DL-080), e o log serve para rastrear "mandei e nada
 * aconteceu", o que os últimos dígitos já resolvem.
 */
export function mascararTelefone(numero: string): string {
  if (numero.length <= 4) {
    return "****";
  }
  return `${"*".repeat(numero.length - 4)}${numero.slice(-4)}`;
}

/**
 * Traduz a resposta de erro da Graph API em um motivo CURTO e uma decisão de
 * permanência. O corpo cru **não** vai para o log: ele é verboso, muda de
 * formato e é onde um eco de credencial apareceria.
 *
 * Códigos que importam (documentação da Cloud API):
 * - `190` / 401: token inválido ou expirado — reconectar;
 * - 403: permissão faltando na conexão;
 * - `131030`: destinatário fora da lista permitida (conta **não verificada** —
 *   é o teto da WABA de desenvolvimento, DL-081);
 * - `131047`: janela de 24h fechada — precisa de MODELO aprovado (Story 6.18);
 * - `131026`: número de destino não tem WhatsApp;
 * - `4` / `80007` / 429: limite de chamadas — temporário;
 * - 5xx: a Meta caiu — temporário.
 */
export function classificarErro(
  status: number,
  corpo: Record<string, unknown> | undefined,
): { motivo: string; permanente: boolean } {
  const erro = (corpo?.error ?? {}) as Record<string, unknown>;
  const codigo = Number(erro.code);
  const subcodigo = Number(erro.error_subcode);

  if (status === 401 || codigo === 190) {
    return {
      motivo:
        "token da conexão inválido ou expirado — refaça a conexão do WhatsApp desta empresa",
      permanente: true,
    };
  }
  if (codigo === 131030) {
    return {
      motivo:
        "destinatário fora da lista permitida da conta (conta não verificada)",
      permanente: true,
    };
  }
  if (codigo === 131047 || subcodigo === 131047) {
    return {
      motivo:
        "janela de 24h fechada — mensagem iniciada por nós exige modelo aprovado (Story 6.18)",
      permanente: true,
    };
  }
  if (codigo === 131026) {
    return { motivo: "o número de destino não tem WhatsApp", permanente: true };
  }
  if (status === 429 || codigo === 4 || codigo === 80007) {
    return { motivo: "limite de chamadas da Meta atingido", permanente: false };
  }
  if (status >= 500) {
    return { motivo: `a Meta respondeu ${status}`, permanente: false };
  }
  if (status === 403) {
    return {
      motivo: "a conexão não tem permissão para enviar por este número",
      permanente: true,
    };
  }
  // Sem eco do corpo: só o código, que é o suficiente para procurar na
  // documentação e não carrega conteúdo.
  const sufixoCodigo = Number.isFinite(codigo) ? `, código ${codigo}` : "";
  return {
    motivo: `a Meta recusou o envio (HTTP ${status}${sufixoCodigo})`,
    permanente: true,
  };
}
