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
    /**
     * Refinamento DL-062 (2026-08-14): quando presente, restringe às clientes
     * que ESTE profissional atendeu (tem ≥1 agendamento não deletado com ela).
     * `undefined` = sem recorte (quem gerencia a equipe vê a carteira inteira).
     */
    attendedByProfessionalId?: string;
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

    if (params.attendedByProfessionalId) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM appointments ap WHERE ap.client_id = c.id " +
          "AND ap.company_id = c.company_id AND ap.is_deleted = false " +
          "AND ap.professional_id = :attendedBy)",
        { attendedBy: params.attendedByProfessionalId },
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
  /**
   * Situação financeira por cliente (Story 5.5): soma dos pagamentos `pendente`
   * (`owed`) e `pago` (`paid`) dos agendamentos de cada cliente, tenant-scoped.
   * Uma query agregada para o conjunto de ids (a lista pagina, então é barato).
   */
  async financeByClientIds(
    ids: string[],
  ): Promise<Map<string, { owed: number; paid: number }>> {
    const map = new Map<string, { owed: number; paid: number }>();
    if (ids.length === 0) return map;
    const placeholders = ids.map(() => "?").join(",");
    const rows: Array<{ client_id: string; owed: string; paid: string }> =
      await this.repo.query(
        `SELECT ap.client_id AS client_id,
           COALESCE(SUM(CASE WHEN pay.status = 'pendente' THEN pay.amount ELSE 0 END), 0) AS owed,
           COALESCE(SUM(CASE WHEN pay.status = 'pago' THEN pay.amount ELSE 0 END), 0) AS paid
         FROM payments pay
         JOIN appointments ap
           ON ap.id = pay.appointment_id AND ap.company_id = pay.company_id
         WHERE pay.company_id = ? AND ap.client_id IN (${placeholders})
         GROUP BY ap.client_id`,
        [this.companyId, ...ids],
      );
    for (const r of rows) {
      map.set(String(r.client_id), {
        owed: Number(r.owed),
        paid: Number(r.paid),
      });
    }
    return map;
  }

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
