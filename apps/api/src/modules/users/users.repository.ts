import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../database/entities/user.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/** Repositório de usuários escopado pelo tenant atual (NFR-S1). */
@Injectable()
export class UsersRepository extends TenantAwareRepository<User> {
  constructor(
    @InjectRepository(User) repo: Repository<User>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }
}
