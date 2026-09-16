import type { WhatsAppProviderName } from "../../database/entities/company-whatsapp-connection.entity";

export type { WhatsAppProviderName };

/**
 * ABSTRAÇÃO DO CANAL (NFR-O3, DL-054) — Story 6.1.
 *
 * Ela existe por UM motivo: tornar a troca de provider barata. Produção é
 * **exclusivamente a Cloud API oficial da Meta**; a abstração não é um convite a
 * usar outra coisa lá — é o seguro para o dia em que a Meta mudar as regras.
 * Quem escolhe a implementação é a `WhatsAppProviderFactory`, e ela **recusa**
 * qualquer provider não oficial fora de desenvolvimento.
 *
 * A instância é **ligada a um tenant**: as credenciais entram na construção, não
 * em cada chamada. É o que torna impossível, por construção, mandar a mensagem
 * de uma empresa com o token de outra — o erro que o isolamento por `company_id`
 * existe para impedir e que nenhuma revisão de código pega de forma confiável.
 *
 * ONDE ESTÁ `registerIncomingMessageHandler`: no `WhatsAppService` (a fachada),
 * não aqui. O handler de mensagem recebida é **um só para a aplicação inteira** —
 * pendurá-lo num objeto ligado a um tenant sugeriria que existe um handler por
 * empresa, que não existe e não deve existir. As três capacidades que o AC pede
 * (enviar, estado da conexão, registrar quem trata o recebido) estão todas na
 * abstração; duas na instância por tenant e a terceira onde ela é única.
 */
export interface WhatsAppProvider {
  /** Qual implementação é esta. Aparece em log; nunca decide regra de negócio. */
  readonly name: WhatsAppProviderName;

  /** Empresa dona das credenciais com que esta instância foi construída. */
  readonly companyId: string;

  /**
   * Entrega uma mensagem de texto. Falha **permanente** lança
   * `WhatsAppDeliveryException` (AC-4).
   *
   * Custo (DL-054): mensagem de **serviço** — resposta dentro de 24h da mensagem
   * da cliente — é grátis; **utilidade** (confirmação, lembrete) ≈ R$ 0,04–0,05,
   * e a Meta cobra **do cliente**, nunca do Tamarcado (DL-074).
   */
  sendMessage(message: OutgoingMessage): Promise<SendResult>;

  /** Estado do número junto ao provider. Diagnóstico — não gateia envio. */
  getConnectionStatus(): Promise<WhatsAppConnectionStatus>;
}

/** Mensagem de saída. Só texto nesta story — mídia e modelos são 6.18 em diante. */
export interface OutgoingMessage {
  /** Telefone de destino em E.164 **sem** o `+` (ex.: `5511942458672`). */
  to: string;
  text: string;
}

export interface SendResult {
  /** Identificador da mensagem no provider (`wamid...` na Cloud API). */
  providerMessageId: string;
}

/**
 * Estado da conexão, do ponto de vista do provider. `conectado: false` com
 * `motivo` preenchido é o caso útil — é o que a tela da 6.17 vai mostrar.
 */
export interface WhatsAppConnectionStatus {
  provider: WhatsAppProviderName;
  conectado: boolean;
  /** Número em formato legível, como o provider o conhece. */
  displayPhoneNumber?: string;
  /** Qualidade do número segundo a Meta (`GREEN` | `YELLOW` | `RED`). */
  qualidade?: string;
  /** Nome de exibição verificado (o que a cliente vê no WhatsApp dela). */
  nomeExibicao?: string;
  /** Preenchido quando `conectado` é falso. Nunca cita o token. */
  motivo?: string;
}

/**
 * Mensagem RECEBIDA, já traduzida do formato do provider e já com o tenant
 * resolvido. É o que o handler registrado recebe.
 */
export interface IncomingMessage {
  companyId: string;
  /** Identificador do evento no provider (`wamid`) — a 6.20 o usa como chave única. */
  providerMessageId: string;
  /** Telefone de quem escreveu, E.164 sem `+`. */
  from: string;
  /** Nome no perfil do WhatsApp, quando o provider manda. */
  contactName?: string;
  /**
   * Tipo declarado pelo provider (`text`, `image`, `audio`, `button`, …).
   * Chega SEMPRE preenchido: a cliente manda áudio e figurinha desde o primeiro
   * dia, e quem trata precisa poder responder "ainda não entendo isso" em vez de
   * quebrar.
   */
  tipo: string;
  /** Texto da mensagem. **Vazio quando `tipo` não é `text`.** */
  text: string;
  timestamp: Date;
}

/** Quem trata mensagem recebida. Registrado uma vez, na subida da aplicação. */
export type IncomingMessageHandler = (
  message: IncomingMessage,
) => Promise<void> | void;

/**
 * Credenciais de UM tenant, já decifradas, prontas para uso. Este objeto é o
 * único lugar do sistema onde o token aparece em claro — ele **não** tem
 * `toJSON`, **não** vai para log e **não** entra em resposta de API.
 */
export interface TenantWhatsAppCredentials {
  companyId: string;
  provider: WhatsAppProviderName;
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
}
