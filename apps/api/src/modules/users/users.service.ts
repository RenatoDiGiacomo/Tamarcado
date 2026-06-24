import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../database/entities/user.entity";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(
    // Repositório CRU (sem tenant) — usado SÓ no login, que é pré-tenant (DL-026)
    // e filtra company_id explicitamente.
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    // Repositório tenant-aware — usado nas rotas autenticadas (tenant no contexto).
    private readonly tenantUsers: UsersRepository,
  ) {}

  /** Login (pré-tenant): lookup explícito por (company_id, email). */
  findByCompanyAndEmail(
    companyId: string,
    email: string,
  ): Promise<User | null> {
    return this.repo.findOne({ where: { company_id: companyId, email } });
  }

  /**
   * Lookup por id SEM tenant — usado só pelo refresh (pré-tenant, sem
   * middleware). O refresh token é assinado/verificado; reemite para o próprio
   * usuário. Não usar em rotas tenant-aware.
   */
  findByIdUnscoped(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Tenant-scoped: id de outro tenant retorna null (→ 404 no controller). */
  findById(id: string): Promise<User | null> {
    return this.tenantUsers.findById(id);
  }

  /** Tenant-scoped: lista apenas usuários do tenant atual. */
  listForTenant(): Promise<User[]> {
    return this.tenantUsers.findAll();
  }

  /** Tenant-scoped: contagem do tenant atual (nunca inclui outros tenants). */
  countForTenant(): Promise<number> {
    return this.tenantUsers.count();
  }
}
