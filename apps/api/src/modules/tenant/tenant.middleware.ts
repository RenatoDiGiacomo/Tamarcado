import { ForbiddenException, Injectable, NestMiddleware } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { NextFunction, Request, Response } from "express";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/**
 * Resolve o tenant da requisição (architecture.md §6).
 *
 * IMPORTANTE (ordem do NestJS): middlewares rodam ANTES dos guards, então este
 * middleware VERIFICA o token por conta própria (assinatura + expiração com
 * JWT_SECRET) — não depende do JwtAuthGuard, que roda depois. Decodificar sem
 * verificar permitiria um companyId forjado furar o isolamento.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    // Sem token: rota pública ou o JwtAuthGuard responderá 401 mais adiante.
    if (!token) {
      next();
      return;
    }

    let companyId: string | undefined;
    try {
      const payload = this.jwt.verify<{ companyId?: string }>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
      companyId = payload.companyId;
    } catch {
      // Token inválido/expirado: deixa o guard da rota responder 401.
      next();
      return;
    }

    if (!companyId) {
      next();
      return;
    }

    const company = await this.companies.findOne({
      where: { id: companyId, is_active: true },
    });
    if (!company) {
      throw new ForbiddenException("Instalação inválida ou inativa");
    }

    this.tenantContext.run(companyId, () => next());
  }
}
