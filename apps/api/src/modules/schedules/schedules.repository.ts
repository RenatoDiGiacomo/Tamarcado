import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProfessionalSchedule } from "../../database/entities/professional-schedule.entity";
import { TenantAwareRepository } from "../../common/repository/tenant-aware.repository";
import { TenantContextService } from "../../common/tenant/tenant-context.service";

/** Horários de trabalho escopados pelo tenant atual (NFR-S1). */
@Injectable()
export class ProfessionalSchedulesRepository extends TenantAwareRepository<ProfessionalSchedule> {
  constructor(
    @InjectRepository(ProfessionalSchedule)
    repo: Repository<ProfessionalSchedule>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }
}
