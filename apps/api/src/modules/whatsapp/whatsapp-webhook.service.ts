import { Injectable, Logger } from "@nestjs/common";
import { GatedByCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilitiesService } from "../capabilities/capabilities.service";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppService } from "./whatsapp.service";
import { mascararTelefone } from "./providers/cloud-api.provider";
import {
  parseCloudApiWebhook,
  type CloudApiEvent,
} from "./providers/cloud-api.payload";

/** O que aconteceu com um lote de eventos. Log, teste e diagnóstico. */
export interface WebhookProcessResult {
  recebidos: number;
  mensagens: number;
  /** Empresa achada, mas sem a capability — evento descartado (camada 3). */
  ignorados: number;
  /** Número que não pertence a nenhum tenant. */
  naoRoteados: number;
  /** Status de entrega (enviado/entregue/lido/falhou) — conhecidos, só registrados. */
  status: number;
  /** Evento de conta, eco da coexistência, formato novo da Meta. */
  desconhecidos: number;
  /** Eventos cujo tratamento lançou. Isolados: não contaminam os outros. */
  falhas: number;
}

/**
 * PROCESSAMENTO do que a Meta manda (Story 6.1).
 *
 * Ele existe separado do controller por um motivo que vale mais que organização:
 * o endpoint do webhook **não pode acumular regra de negócio** (DL-080). O
 * controller valida a assinatura e delega; tudo o que é decisão mora aqui. Na
 * Story 6.20 o que muda é apenas **quem chama este serviço** — o endpoint passa
 * a gravar o evento e responder 200, e quem chama daqui em diante é o
 * processador, fora do ciclo da resposta. Nada deste arquivo precisa mudar para
 * aquilo acontecer, e é para isso que a costura está aqui.
 *
 * TRÊS INVARIANTES, todos exercitados por teste:
 *
 * 1. **NUNCA LANÇA.** Um POST traz vários eventos; um evento ruim não pode levar
 *    os outros junto, e uma exceção que suba até o controller vira resposta ruim
 *    à Meta — que **desativa o webhook do aplicativo inteiro**, derrubando todos
 *    os tenants.
 * 2. **EVENTO QUE NÃO SEI TRATAR NÃO DERRUBA NADA.** Status de entrega, eventos
 *    de conta, eco da coexistência (DL-074) e formato novo da Meta são
 *    registrados e seguem adiante.
 * 3. **CAMADA 3 DO DL-072.** Empresa sem `whatsapp_bot` tem a mensagem
 *    **descartada** aqui. É o único gate deste caminho: o webhook é chamado pela
 *    Meta, sem login, e nenhum guard roda. Registrado em
 *    `CAPABILITY_GATED_ENTRYPOINTS` — o guard-rail falha a suíte se esta classe
 *    deixar de alcançar o `CapabilitiesService`.
 *
 * BÔNUS COMERCIAL REGISTRADO (DL-080): o descarte por capability é **logado com
 * a empresa**. Fica o rastro de que chegou mensagem para empresa cortada, que é
 * a conversa de venda concreta — *"no mês passado 40 clientes escreveram para
 * você e ninguém respondeu"*. A contagem em si é dado da tabela da 6.20.
 */
@GatedByCapability("whatsapp_bot")
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly connections: WhatsAppConnectionService,
    private readonly capabilities: CapabilitiesService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /**
   * Processa o payload inteiro. **Não lança**, em nenhuma hipótese — o retorno é
   * um resumo, não um veredito de sucesso.
   */
  async processar(payload: unknown): Promise<WebhookProcessResult> {
    const resultado: WebhookProcessResult = {
      recebidos: 0,
      mensagens: 0,
      ignorados: 0,
      naoRoteados: 0,
      status: 0,
      desconhecidos: 0,
      falhas: 0,
    };

    let eventos: CloudApiEvent[];
    try {
      eventos = parseCloudApiWebhook(payload);
    } catch (erro) {
      // O parser é escrito para não lançar; se lançar mesmo assim, o webhook
      // ainda assim não pode cair.
      this.logger.error(`falha ao ler o payload do webhook: ${motivoDe(erro)}`);
      resultado.falhas += 1;
      return resultado;
    }

    resultado.recebidos = eventos.length;
    for (const evento of eventos) {
      try {
        await this.processarEvento(evento, resultado);
      } catch (erro) {
        // ISOLAMENTO POR EVENTO: o próximo continua. Sem isto, a primeira
        // mensagem problemática de um lote de dez engole as outras nove.
        resultado.falhas += 1;
        this.logger.error(
          `falha ao processar evento do webhook (${evento.kind}): ${motivoDe(erro)}`,
        );
      }
    }
    return resultado;
  }

  private async processarEvento(
    evento: CloudApiEvent,
    resultado: WebhookProcessResult,
  ): Promise<void> {
    if (evento.kind === "desconhecido") {
      resultado.desconhecidos += 1;
      this.logger.log(`evento não tratado: ${evento.descricao}`);
      return;
    }

    // ROTEAMENTO — lookup pelo identificador do número que a Meta mandou.
    // É lookup, não regra (AC-3): não decide nada, só descobre de quem é.
    const companyId = await this.connections.empresaDoNumero(
      evento.phoneNumberId,
    );
    if (!companyId) {
      resultado.naoRoteados += 1;
      // Acontece de verdade: número que saiu da plataforma, aplicativo de teste
      // apontado para o nosso webhook, evento atrasado. Nunca é erro nosso.
      this.logger.warn(
        `evento para número sem tenant: phone_number_id=${evento.phoneNumberId} tipo=${evento.kind}`,
      );
      return;
    }

    if (evento.kind === "status") {
      resultado.status += 1;
      // Status de entrega (enviado/entregue/lido/falhou). Nesta story ele só é
      // registrado. É daqui que sai, na 6.20/6.17, a CONTAGEM de mensagens
      // enviadas por empresa — ver a nota da 6.17 no epics.md.
      this.logger.log(
        `status de entrega: empresa=${companyId} id=${evento.providerMessageId} status=${evento.status}`,
      );
      return;
    }

    // CAMADA 3 DO GATE (DL-072). Empresa sem o direito: descarta e registra.
    const permitido = await this.capabilities.hasCapability(
      companyId,
      "whatsapp_bot",
    );
    if (!permitido) {
      resultado.ignorados += 1;
      this.logger.warn(
        `mensagem descartada — empresa=${companyId} sem "whatsapp_bot" ` +
          `(de=${mascararTelefone(evento.from)})`,
      );
      return;
    }

    resultado.mensagens += 1;
    this.logger.log(
      `mensagem recebida: empresa=${companyId} de=${mascararTelefone(evento.from)} ` +
        `tipo=${evento.tipo} id=${evento.providerMessageId}`,
    );
    await this.whatsapp.dispatchIncoming({
      companyId,
      providerMessageId: evento.providerMessageId,
      from: evento.from,
      contactName: evento.contactName,
      tipo: evento.tipo,
      text: evento.text,
      timestamp: evento.timestamp,
    });
  }
}

function motivoDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
