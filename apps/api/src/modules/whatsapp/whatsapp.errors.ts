import { HttpException, HttpStatus } from "@nestjs/common";
import type { CapabilityKey } from "../../common/capabilities/capability";

/**
 * Erros do canal de WhatsApp (Story 6.1).
 *
 * REGRA QUE VALE PARA TODOS ELES: **a mensagem nunca cita o token**, nem
 * inteiro, nem truncado, nem "terminado em ...". Mensagem de erro vira log, vira
 * resposta de API e vira print no grupo do suporte — é o vazamento mais fácil de
 * cometer e o mais difícil de perceber. Quando o motivo do erro *é* o token, o
 * texto diz **qual empresa** e **o que fazer**, nunca **qual era o valor**.
 */

/** Falha de ENTREGA da mensagem. Permanente = não adianta repetir igual. */
export class WhatsAppDeliveryException extends HttpException {
  constructor(
    readonly companyId: string,
    readonly motivo: string,
    /** `true` quando repetir a mesma requisição tende a falhar de novo. */
    readonly permanente = true,
  ) {
    super(
      `Falha ao entregar mensagem de WhatsApp (empresa ${companyId}): ${motivo}`,
      HttpStatus.BAD_GATEWAY,
    );
  }
}

/** A empresa não tem conexão utilizável (nunca conectou, ou desconectou). */
export class WhatsAppNotConnectedException extends HttpException {
  constructor(readonly companyId: string) {
    super(
      `A empresa ${companyId} não tem WhatsApp conectado.`,
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * CAMADA 3 do DL-072: o caminho sem request (envio disparado pelo agendador,
 * processamento do webhook) achou uma empresa sem o direito.
 *
 * É um erro e não um `return` silencioso porque quem chama precisa **saber** que
 * não enviou — mas quem chama também nunca pode deixá-lo chegar na resposta ao
 * webhook (ver `whatsapp-webhook.service.ts`).
 */
export class WhatsAppCapabilityMissingException extends Error {
  constructor(
    readonly companyId: string,
    readonly capability: CapabilityKey,
  ) {
    super(
      `A empresa ${companyId} não tem o recurso "${capability}" liberado.`,
    );
    this.name = "WhatsAppCapabilityMissingException";
  }
}

/**
 * Configuração do servidor ausente ou inválida — segredo do app, chave de
 * cifra, provider não permitido no ambiente. **Erro de operação, não do
 * usuário**: aparece na subida ou na primeira chamada, e o texto diz qual
 * variável falta.
 */
export class WhatsAppConfigException extends Error {
  constructor(motivo: string) {
    super(`Configuração de WhatsApp inválida: ${motivo}`);
    this.name = "WhatsAppConfigException";
  }
}
