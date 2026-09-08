import { Type } from "@nestjs/common";

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
 * COMO REGISTRAR: ao criar o processador do webhook (Story 6.20) ou um tipo de
 * tarefa do agendador que toque domínio gateado, adicione a classe a esta lista.
 * O guard-rail (`capability-coverage.spec.ts`) exige que cada uma alcance o
 * `CapabilitiesService` no grafo de DI — sem ele injetado, não há como checar o
 * direito, e a suíte FALHA.
 *
 * VAZIA HOJE, e isso é fato verificável, não pendência esquecida: nenhum dos dois
 * caminhos existe ainda. O webhook nasce na Story 6.1 e o processador na 6.20
 * (DL-080 moveu o gate do endpoint para o processador — a camada 3 **mudou de
 * lugar, não desapareceu**); o agendador nasce na 6.2. O mecanismo é entregue
 * aqui, pronto, para que a story que criar esses pontos não possa esquecê-los.
 *
 * DETALHE QUE A 6.20 NÃO PODE ERRAR (DL-072/DL-080): empresa sem capability →
 * o evento é gravado e marcado `ignorado`, e a resposta à Meta continua **200**.
 * Responder erro faz a Meta repetir a entrega e, na insistência, **desativar o
 * webhook** — derrubando o canal de TODOS os tenants, não só o cortado.
 */
export const CAPABILITY_GATED_ENTRYPOINTS: Type[] = [];
