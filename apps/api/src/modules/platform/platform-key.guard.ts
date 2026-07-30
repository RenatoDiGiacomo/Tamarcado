import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";

/**
 * Protege o endpoint de plataforma (Story 1.9). Exige o header `x-platform-key`
 * igual ao `PLATFORM_KEY` do ambiente (NUNCA no repositório). Sem chave
 * configurada → nega tudo (falha fechada — não abre por esquecimento de env).
 * Comparação em tempo constante para não vazar a chave por timing.
 */
@Injectable()
export class PlatformKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("PLATFORM_KEY");
    if (!expected) {
      // Falha fechada: sem chave no ambiente, o endpoint fica inacessível.
      throw new UnauthorizedException();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header("x-platform-key") ?? "";
    if (!safeEqual(provided, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

/** Igualdade em tempo constante (tolera tamanhos diferentes sem vazar timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}
