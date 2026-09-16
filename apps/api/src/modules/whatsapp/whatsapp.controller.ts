import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import {
  assinaturaValida,
  CABECALHO_ASSINATURA,
  WebhookSignatureAlarm,
} from "./webhook-signature";
import { segredosIguais } from "./whatsapp-token.cipher";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

/**
 * WEBHOOK da Cloud API (Story 6.1). **Chamado pela META**, sem login nenhum.
 *
 * Esse "sem login nenhum" tem três consequências, e todas moram neste arquivo:
 *
 * 1. **A ASSINATURA É A ÚNICA PROVA** de que a requisição veio da Meta. Sem ela,
 *    qualquer um na internet manda "a cliente quer cancelar" e o bot obedece.
 *    Rejeitar é o comportamento certo — e rejeição **em massa** precisa acordar
 *    alguém (`WebhookSignatureAlarm`), porque o padrão dela é segredo errado
 *    depois de uma implantação, não ataque (DL-080).
 *
 * 2. **RESPONDER MAL CUSTA O CANAL DE TODOS.** A Meta desativa o webhook do
 *    **aplicativo inteiro** por qualquer resposta ruim — exceção, banco fora,
 *    demora. Um tenant com problema derrubaria o bot de todos os
 *    estabelecimentos. Por isso o processamento **não lança**: o
 *    `WhatsAppWebhookService` isola evento por evento e devolve um resumo.
 *
 * 3. **NÃO HÁ TENANT NO CONTEXTO.** Quem descobre de quem é a mensagem é o
 *    lookup pelo identificador do número (AC-3) — por isso nenhum serviço deste
 *    caminho pode usar `TenantAwareRepository`: não há `TenantContext` para ele
 *    ler. Todos recebem `companyId` explícito.
 *
 * ⚠️ **ESTE ENDPOINT NÃO PODE ACUMULAR REGRA DE NEGÓCIO.** Ele faz três coisas e
 * só três: confere a assinatura, entrega o payload ao serviço, responde 200. A
 * Story 6.20 vai **entrar no meio** — gravar o evento cru e responder 200 antes
 * de processar — e o único ponto que ela precisa tocar aqui é a linha que hoje
 * chama `processar`. Qualquer `if` de negócio acrescentado aqui transforma
 * aquela story em refactor.
 *
 * Fora do Swagger de propósito (`@ApiExcludeController`): não é contrato de
 * cliente nosso, é contrato da Meta, e publicá-lo só convida a chamá-lo.
 */
@ApiExcludeController()
@Controller("whatsapp")
export class WhatsAppController {
  constructor(
    private readonly config: ConfigService,
    private readonly webhook: WhatsAppWebhookService,
    private readonly alarme: WebhookSignatureAlarm,
  ) {}

  /**
   * HANDSHAKE de verificação. A Meta chama uma vez, ao cadastrar a URL no
   * painel, e espera o `hub.challenge` **de volta em texto puro**. Devolver JSON
   * faz o cadastro falhar com uma mensagem que não explica nada.
   *
   * O `hub.verify_token` é escolhido por nós no painel da Meta e conferido em
   * tempo constante — ele é um segredo compartilhado como outro qualquer.
   */
  @Get("webhook")
  @Header("content-type", "text/plain; charset=utf-8")
  verificar(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string,
  ): string {
    const esperado =
      this.config.get<string>("WHATSAPP_WEBHOOK_VERIFY_TOKEN") ?? "";
    if (mode !== "subscribe" || !esperado || !token) {
      throw new ForbiddenException("verificação de webhook recusada");
    }
    if (!segredosIguais(token, esperado)) {
      this.alarme.registrarRejeicao(
        "hub.verify_token diferente do configurado (handshake)",
      );
      throw new ForbiddenException("verificação de webhook recusada");
    }
    return challenge ?? "";
  }

  /**
   * Recepção dos eventos. Responde **200 com corpo curto**, sempre que a
   * assinatura confere.
   *
   * O `@HttpCode(200)` é explícito porque o padrão do Nest para `@Post` é 201, e
   * a Meta trata qualquer coisa fora de 200 como entrega falha — reenvia e, na
   * insistência, desativa o webhook.
   */
  @Post("webhook")
  @HttpCode(200)
  async receber(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ recebido: true }> {
    const appSecret = this.config.get<string>("WHATSAPP_APP_SECRET") ?? "";
    if (!appSecret) {
      // FAIL-CLOSED: sem segredo não há como distinguir a Meta de qualquer um.
      // Aceitar "por enquanto" é abrir o bot para a internet inteira.
      this.alarme.registrarRejeicao(
        "WHATSAPP_APP_SECRET ausente no ambiente — nenhuma requisição pode ser validada",
      );
      throw new ForbiddenException("assinatura inválida");
    }

    const cabecalho = req.header(CABECALHO_ASSINATURA) ?? undefined;
    if (!assinaturaValida(req.rawBody, cabecalho, appSecret)) {
      this.alarme.registrarRejeicao(
        cabecalho
          ? `assinatura não confere (${CABECALHO_ASSINATURA})`
          : `requisição sem o cabeçalho ${CABECALHO_ASSINATURA}`,
      );
      throw new ForbiddenException("assinatura inválida");
    }
    this.alarme.registrarAceita();

    // ÚNICA linha de trabalho do endpoint — e o ponto exato em que a Story 6.20
    // entra: lá, o evento é GRAVADO aqui e processado fora do ciclo da resposta.
    await this.webhook.processar(req.body);

    return { recebido: true };
  }
}
