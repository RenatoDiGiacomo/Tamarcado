import { Type } from "@nestjs/common";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { WhatsAppWebhookService } from "../whatsapp/whatsapp-webhook.service";
import { WhatsAppController } from "../whatsapp/whatsapp.controller";
import { PlatformWhatsAppController } from "../platform/platform-whatsapp.controller";

/**
 * FONTE ÚNICA DE VERDADE da CAMADA 3 do DL-072 — os pontos de entrada que
 * **não são rota** e por isso não têm guard nenhum protegendo-os.
 *
 * São dois caminhos, e são a razão de a camada 3 existir:
 * - o **webhook** é chamado **pela Meta**, sem login nenhum;
 * - o **agendador** (rotina de 1 min, DL-056) roda **sozinho**.
 *
 * Sem checagem aqui, o bot continua respondendo cliente de empresa cortada e o
 * lembrete continua saindo — **cobrado no cartão de quem já não paga**.
 *
 * COMO REGISTRAR: ao criar o processador do webhook ou um tipo de tarefa do
 * agendador que toque domínio gateado, adicione a classe a esta lista. O
 * guard-rail (`capability-coverage.spec.ts`) exige que cada uma alcance o
 * `CapabilitiesService` no grafo de DI — sem ele injetado, não há como checar o
 * direito, e a suíte FALHA.
 *
 * **Story 6.1 — a lista deixou de ser vazia.** Os dois primeiros ocupantes:
 *
 * | classe | o que ela decide | onde |
 * |---|---|---|
 * | `WhatsAppWebhookService` | mensagem de empresa sem `whatsapp_bot` é **descartada** | entrada |
 * | `WhatsAppService` | envio de empresa sem o direito **não sai** | saída |
 *
 * DETALHE QUE A 6.20 NÃO PODE ERRAR (DL-072/DL-080): empresa sem capability →
 * o evento é gravado e marcado `ignorado`, e a resposta à Meta continua **200**.
 * Responder erro faz a Meta repetir a entrega e, na insistência, **desativar o
 * webhook** — derrubando o canal de TODOS os tenants, não só o cortado. Hoje
 * (6.1) o descarte já é silencioso para a Meta: o processamento não lança e o
 * endpoint responde 200 de qualquer jeito.
 */
export const CAPABILITY_GATED_ENTRYPOINTS: Type[] = [
  WhatsAppWebhookService,
  WhatsAppService,
];

/**
 * EXCEÇÃO AUDITÁVEL da CAMADA 2 — controllers que tocam o domínio gateado mas
 * **não são rota de usuário**, e por isso não podem ter `@RequireCapability` +
 * `CapabilityGuard`. Mesmo espírito do `PRE_TENANT_CONTROLLERS` (DL-027): a
 * exceção existe, é curta, e cada entrada precisa de justificativa escrita.
 *
 * O guard-rail impõe **um invariante verificável** sobre esta lista: nenhuma
 * entrada pode ser uma rota autenticada de usuário (nada com `JwtAuthGuard` na
 * pilha). Sem essa regra, a lista viraria o lugar onde se despeja o controller
 * que deu trabalho de gatear — que é exatamente como uma exceção consciente
 * apodrece virando buraco.
 *
 * Hoje, duas entradas:
 *
 * 1. **`WhatsAppController`** — o webhook. Quem chama é a **Meta**, sem login:
 *    não há usuário, não há empresa no contexto e nenhum guard roda. O gate
 *    deste caminho é a **camada 3**, no `WhatsAppWebhookService` (DL-080 moveu o
 *    gate do endpoint para o processamento — mudou de lugar, não desapareceu).
 *
 * 2. **`PlatformWhatsAppController`** — grava a credencial do tenant à mão,
 *    protegido por `x-platform-key`. **Conectar não é usar** (DL-082): rebaixar
 *    plano desliga o USO e preserva o VÍNCULO, então exigir a capability para
 *    conectar impediria justamente o caso normal — preencher a conexão **antes**
 *    de liberar o recurso, ou conferir a conexão de quem foi cortado.
 */
export const CAPABILITY_UNGUARDED_CONTROLLERS: Type[] = [
  WhatsAppController,
  PlatformWhatsAppController,
];
