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
}
