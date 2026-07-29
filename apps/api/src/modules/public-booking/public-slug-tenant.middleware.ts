import { Injectable, NestMiddleware, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { NextFunction, Request, Response } from "express";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/**
 * Resolve o tenant da PÁGINA PÚBLICA pelo **slug** da URL (`/public/:slug/*`),
 * sem JWT (Story 5B.1). Diferente do `TenantMiddleware` (que resolve por token),
 * a chave aqui é o slug — um handle público que o estabelecimento distribui.
 *
 * Seta o `TenantContext` com o `company_id` resolvido, então todo
 * `TenantAwareRepository` downstream sai **scoped** ao salão do slug (mesmo
 * isolamento do painel). Slug inexistente/inativo → 404 ANTES do handler, então
 * nenhuma rota pública toca um repo tenant sem `company_id` setado.
 *
 * Aplicado SÓ aos `PUBLIC_TENANT_CONTROLLERS` (guard-rail DL-027, 3ª categoria).
 * NUNCA lê `companyId` de body/query/header — só o `:slug` do path.
 */
@Injectable()
export class PublicSlugTenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantContext: TenantContextService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const match = req.path.match(/\/public\/([^/]+)/);
    const slug = match?.[1] ? decodeURIComponent(match[1]) : null;
    if (!slug) {
      throw new NotFoundException("Estabelecimento não encontrado.");
    }

    const company = await this.companies.findOne({
      where: { slug, is_active: true },
    });
    if (!company) {
      throw new NotFoundException("Estabelecimento não encontrado.");
    }

    this.tenantContext.run(company.id, () => next());
  }
}
