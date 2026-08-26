import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

/**
 * Rate limit do "esqueci minha senha", em duas chaves independentes:
 *
 * - **por IP** — segura o script que varre e-mails para descobrir quem tem
 *   conta (mesmo com a resposta uniforme, o volume seria abuso) e o uso da
 *   nossa conta do Brevo como máquina de spam;
 * - **por e-mail** — impede encher a caixa de uma pessoa específica pedindo
 *   reset em série. Vale mesmo que os pedidos venham de IPs diferentes.
 *
 * Janela deslizante em memória, como o rate limit da plataforma e o do
 * agendamento público: instância única (DL-016), reinício zera — aceitável no
 * volume real. Se um dia houver mais de um processo, isto vira Redis/tabela.
 *
 * Os limites são folgados para a pessoa de verdade (que erra, tenta de novo,
 * não achou o e-mail e repete) e apertados para script.
 */
@Injectable()
export class ForgotPasswordRateLimitService {
  private readonly porIp = new Map<string, number[]>();
  private readonly porEmail = new Map<string, number[]>();

  private static readonly LIMITE_IP = 10;
  private static readonly JANELA_IP_MS = 15 * 60_000; // 15 min
  private static readonly LIMITE_EMAIL = 3;
  private static readonly JANELA_EMAIL_MS = 60 * 60_000; // 1 h

  /** Lança 429 se estourou por IP ou por e-mail; senão registra os dois hits. */
  assertWithinLimit(ip: string, email: string): void {
    const agora = Date.now();
    const chaveEmail = email.trim().toLowerCase();

    const doIp = this.recentes(this.porIp, ip, agora, ForgotPasswordRateLimitService.JANELA_IP_MS);
    const doEmail = this.recentes(
      this.porEmail,
      chaveEmail,
      agora,
      ForgotPasswordRateLimitService.JANELA_EMAIL_MS,
    );

    if (
      doIp.length >= ForgotPasswordRateLimitService.LIMITE_IP ||
      doEmail.length >= ForgotPasswordRateLimitService.LIMITE_EMAIL
    ) {
      // Mensagem única para os dois casos: dizer "esse e-mail já pediu 3 vezes"
      // confirmaria que o e-mail existe, que é justamente o que a resposta
      // uniforme do endpoint evita.
      throw new HttpException(
        "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    doIp.push(agora);
    this.porIp.set(ip, doIp);
    doEmail.push(agora);
    this.porEmail.set(chaveEmail, doEmail);
  }

  private recentes(
    mapa: Map<string, number[]>,
    chave: string,
    agora: number,
    janelaMs: number,
  ): number[] {
    return (mapa.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  }

  /** Limpa o estado (usado por testes). */
  reset(): void {
    this.porIp.clear();
    this.porEmail.clear();
  }
}
