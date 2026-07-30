import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

/**
 * Rate limit in-memory do endpoint de plataforma (Story 1.9). Janela deslizante
 * por IP — o provisionamento é raro (feito por mim via Insomnia no MVP), então
 * um limite baixo já basta como burst-guard contra abuso/scripts. Single-instance
 * (DL-016): estado em memória, reinício zera (aceitável).
 */
@Injectable()
export class PlatformRateLimitService {
  private readonly hits = new Map<string, number[]>();
  private readonly limit = 10;
  private readonly windowMs = 60_000;

  /** Lança 429 se o IP estourou a janela; senão registra o hit. */
  assertWithinLimit(ip: string): void {
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (recent.length >= this.limit) {
      throw new HttpException(
        "Muitas solicitações. Tente novamente em instantes.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(ip, recent);
  }

  /** Limpa o estado (usado por testes). */
  reset(): void {
    this.hits.clear();
  }
}
