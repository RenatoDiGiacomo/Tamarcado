import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";

interface TenantStore {
  companyId: string;
}

/**
 * Mantém o `company_id` do tenant corrente por request via AsyncLocalStorage
 * (architecture.md §6). O TenantMiddleware o popula; o TenantAwareRepository o lê.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  /** Executa o callback dentro do contexto do tenant informado. */
  run<T>(companyId: string, callback: () => T): T {
    return this.als.run({ companyId }, callback);
  }

  getCompanyIdOrNull(): string | null {
    return this.als.getStore()?.companyId ?? null;
  }

  /** company_id atual; lança se não houver contexto (rota tenant-aware sem middleware). */
  getCompanyId(): string {
    const companyId = this.getCompanyIdOrNull();
    if (!companyId) {
      throw new Error(
        "TenantContext não definido — TenantMiddleware ausente nesta rota?",
      );
    }
    return companyId;
  }
}
