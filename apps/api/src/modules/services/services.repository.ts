import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SalonService } from "../../database/entities/salon-service.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/** Catálogo de serviços escopado pelo tenant atual (NFR-S1). */
@Injectable()
export class SalonServicesRepository extends TenantAwareRepository<SalonService> {
  constructor(
    @InjectRepository(SalonService) repo: Repository<SalonService>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }
}
