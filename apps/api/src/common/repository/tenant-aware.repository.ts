import type {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from "typeorm";
import { TenantContextService } from "../tenant/tenant-context.service";

/**
 * Base multi-tenant (architecture.md §6.2): injeta `company_id = <tenant atual>`
 * automaticamente em toda leitura e carimba em toda escrita. Subclasses passam o
 * Repository<T> concreto. Nenhuma query escapa do tenant sem o dev notar.
 */
export abstract class TenantAwareRepository<T extends ObjectLiteral> {
  protected constructor(
    protected readonly repo: Repository<T>,
    protected readonly tenantContext: TenantContextService,
  ) {}

  protected get companyId(): string {
    return this.tenantContext.getCompanyId();
  }

  private scopedWhere(
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): FindOptionsWhere<T> {
    const base = (where ?? {}) as Record<string, unknown>;
    return { ...base, company_id: this.companyId } as unknown as FindOptionsWhere<T>;
  }

  findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find({
      ...options,
      where: this.scopedWhere(options?.where),
    });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne({
      ...options,
      where: this.scopedWhere(options.where),
    });
  }

  findById(id: string | number): Promise<T | null> {
    return this.repo.findOne({
      where: { id, company_id: this.companyId } as unknown as FindOptionsWhere<T>,
    });
  }

  count(options?: FindManyOptions<T>): Promise<number> {
    return this.repo.count({
      ...options,
      where: this.scopedWhere(options?.where),
    });
  }

  save(entity: DeepPartial<T>): Promise<T> {
    return this.repo.save({
      ...entity,
      company_id: this.companyId,
    } as DeepPartial<T>);
  }
}
