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

  /**
   * Listagem paginada da gestão (Story 4.1). Sempre exclui deletados (D5/LGPD).
   * `search` filtra por nome/telefone (parcial; registros sem telefone não casam
   * o LIKE de telefone, mas aparecem por nome/na lista — D6). Ordena por nome.
   */
  async list(params: {
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: Client[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder("c")
      .where("c.company_id = :companyId", { companyId: this.companyId })
      .andWhere("c.is_deleted = false");

    const term = (params.search ?? "").trim();
    if (term !== "") {
      qb.andWhere(
        "(c.name LIKE :like OR c.phone_whatsapp LIKE :like OR c.phone_whatsapp_normalized LIKE :like)",
        { like: `%${term}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy("c.name", "ASC")
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getManyAndCount();
    return { rows, total };
  }

  /** Cliente NÃO deletada do tenant (Story 4.1) — soft delete some daqui (D5). */
  async findActiveById(id: string): Promise<Client | null> {
    return this.repo
      .createQueryBuilder("c")
      .where("c.id = :id", { id })
      .andWhere("c.company_id = :companyId", { companyId: this.companyId })
      .andWhere("c.is_deleted = false")
      .getOne();
  }

  /**
   * Outra cliente (não a `exceptId`) com o MESMO telefone normalizado — checagem
   * de colisão na edição (D3). Só faz sentido com telefone não-null (D6).
   */
  async findByNormalizedPhone(
    normalized: string,
    exceptId?: string,
  ): Promise<Client | null> {
    const qb = this.repo
      .createQueryBuilder("c")
      .where("c.company_id = :companyId", { companyId: this.companyId })
      .andWhere("c.is_deleted = false")
      .andWhere("c.phone_whatsapp_normalized = :normalized", { normalized });
    if (exceptId) qb.andWhere("c.id != :exceptId", { exceptId });
    return qb.getOne();
  }
}
