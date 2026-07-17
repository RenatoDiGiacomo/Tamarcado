import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Client } from "../../database/entities/client.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/** Clientes finais escopados pelo tenant atual (NFR-S1). Base da Story 3.1. */
@Injectable()
export class ClientsRepository extends TenantAwareRepository<Client> {
  constructor(
    @InjectRepository(Client) repo: Repository<Client>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  /**
   * Busca por nome ou telefone (parcial), tenant-scoped, para o autocomplete do
   * agendamento manual (Story 3.3). Ordena por nome; limite pequeno.
   */
  async search(term: string, limit = 10): Promise<Client[]> {
    const like = `%${term}%`;
    return this.repo
      .createQueryBuilder("c")
      .where("c.company_id = :companyId", { companyId: this.companyId })
      .andWhere("c.is_deleted = false")
      .andWhere(
        "(c.name LIKE :like OR c.phone_whatsapp LIKE :like OR c.phone_whatsapp_normalized LIKE :like)",
        { like },
      )
      .orderBy("c.name", "ASC")
      .limit(limit)
      .getMany();
  }
}
