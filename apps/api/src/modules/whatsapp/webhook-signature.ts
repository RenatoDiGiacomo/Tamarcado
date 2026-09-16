import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";

/** Cabeçalho em que a Meta manda a assinatura do corpo. */
export const CABECALHO_ASSINATURA = "x-hub-signature-256";

/**
 * A assinatura é a **única prova** de que a requisição veio da Meta (DL-080,
 * passo 2). O webhook não passa por login nenhum: sem esta conferência,
 * qualquer um na internet manda "a cliente pediu para cancelar" e o bot obedece.
 *
 * COMO A META ASSINA: `sha256=<hmac hex>`, do **corpo exatamente como trafegou**,
 * com o *App Secret* do aplicativo. Daí a exigência do corpo CRU — reserializar
 * o JSON muda espaços e ordem, e a conferência passa a falhar sempre.
 *
 * Comparação em tempo constante. Assinatura é segredo comparado a cada
 * requisição; comparar com `===` conta o tempo e vaza, byte a byte, o valor
 * esperado.
 */
export function assinaturaValida(
  corpoCru: Buffer | undefined,
  cabecalho: string | undefined,
  appSecret: string,
): boolean {
  if (!corpoCru || !cabecalho || !appSecret) {
    return false;
  }
  const [algoritmo, recebida] = cabecalho.split("=");
  if (algoritmo !== "sha256" || !recebida) {
    return false;
  }
  const esperada = createHmac("sha256", appSecret)
    .update(corpoCru)
    .digest("hex");
  const bufRecebida = Buffer.from(recebida, "hex");
  const bufEsperada = Buffer.from(esperada, "hex");
  if (bufRecebida.length !== bufEsperada.length || bufEsperada.length === 0) {
    return false;
  }
  return timingSafeEqual(bufRecebida, bufEsperada);
}

/**
 * ALARME de rejeição em massa (DL-080).
 *
 * O problema real que isto resolve: **segredo errado depois de uma implantação**.
 * Aí *tudo* é rejeitado — e, como cada rejeição isolada é indistinguível de
 * ruído da internet, ninguém olha. Enquanto isso a Meta insiste, não recebe
 * resposta boa e **desativa o webhook do aplicativo inteiro**, derrubando o
 * canal de TODOS os estabelecimentos.
 *
 * O sinal que separa os dois casos não é a quantidade de rejeições: é a
 * **ausência de acerto junto delas**. Ataque e ruído convivem com tráfego
 * legítimo; configuração quebrada, não. Por isso o alarme exige as duas
 * condições na mesma janela — muitas rejeições **e zero aceitas**.
 *
 * In-memory e single-instance, como o rate limit da plataforma (DL-016):
 * reiniciar zera, e isso é aceitável — o alarme volta a disparar em minutos se o
 * problema continuar.
 */
@Injectable()
export class WebhookSignatureAlarm {
  private readonly logger = new Logger(WebhookSignatureAlarm.name);
  private readonly janelaMs = 5 * 60_000;
  private readonly limiteRejeicoes = 5;
  /** Silêncio entre dois alarmes, para não inundar o log com a mesma notícia. */
  private readonly intervaloAlarmeMs = 5 * 60_000;

  private rejeicoes: number[] = [];
  private aceitas: number[] = [];
  private ultimoAlarme = 0;

  registrarAceita(): void {
    this.aceitas = this.recentes(this.aceitas);
    this.aceitas.push(Date.now());
  }

  /** Registra a rejeição e dispara o alarme quando o padrão for de configuração. */
  registrarRejeicao(motivo: string): void {
    this.rejeicoes = this.recentes(this.rejeicoes);
    this.rejeicoes.push(Date.now());
    this.aceitas = this.recentes(this.aceitas);

    this.logger.warn(`webhook rejeitado: ${motivo}`);

    const agora = Date.now();
    const emMassa =
      this.rejeicoes.length >= this.limiteRejeicoes && this.aceitas.length === 0;
    const podeAlarmar = agora - this.ultimoAlarme >= this.intervaloAlarmeMs;
    if (emMassa && podeAlarmar) {
      this.ultimoAlarme = agora;
      this.logger.error(
        `ALARME: ${this.rejeicoes.length} webhooks rejeitados por assinatura nos ` +
          `últimos ${this.janelaMs / 60_000} minutos e NENHUM aceito. ` +
          "O padrão é de WHATSAPP_APP_SECRET errado no servidor (implantação), " +
          "não de ataque. Confira a variável no ambiente da API e reinicie. " +
          "Enquanto isso durar, a Meta pode DESATIVAR o webhook do aplicativo " +
          "inteiro — o que derruba o canal de todos os estabelecimentos (DL-080).",
      );
    }
  }

  /** Estado atual, para teste e diagnóstico. */
  get contagem(): { rejeicoes: number; aceitas: number } {
    return {
      rejeicoes: this.recentes(this.rejeicoes).length,
      aceitas: this.recentes(this.aceitas).length,
    };
  }

  reset(): void {
    this.rejeicoes = [];
    this.aceitas = [];
    this.ultimoAlarme = 0;
  }

  private recentes(marcas: number[]): number[] {
    const agora = Date.now();
    return marcas.filter((t) => agora - t < this.janelaMs);
  }
}
