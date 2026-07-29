import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

interface Window {
  limit: number;
  windowMs: number;
}

/**
 * Rate limit in-memory (sem dependência externa) para o POST público (Story
 * 5B.2). Janelas deslizantes por **IP** e por **slug** — protege contra rajada
 * (muitos telefones diferentes num curto intervalo). O antispam de 2h por
 * telefone é feito no service (via banco); este é o burst-guard.
 *
 * MVP single-instance (VPS, DL-016): estado em memória é suficiente; reinício
 * zera (aceitável para rate limit). Evolução: store compartilhado (Redis).
 */
@Injectable()
export class PublicRateLimitService {
  private readonly hits = new Map<string, number[]>();
  private readonly perIp: Window = { limit: 8, windowMs: 60_000 };
  private readonly perSlug: Window = { limit: 20, windowMs: 60_000 };

  /** Lança 429 se o IP ou o slug estourou a janela; senão registra o hit. */
  assertWithinLimit(ip: string, slug: string): void {
    this.consume(`ip:${ip}`, this.perIp);
    this.consume(`slug:${slug}`, this.perSlug);
  }

  private consume(key: string, w: Window): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < w.windowMs,
    );
    if (recent.length >= w.limit) {
      throw new HttpException(
        "Muitas solicitações. Tente novamente em instantes.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
  }

  /** Limpa o estado (usado por testes). */
  reset(): void {
    this.hits.clear();
  }
}
