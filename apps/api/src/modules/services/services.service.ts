import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SalonService } from "../../database/entities/salon-service.entity";
import { ProfessionalService } from "../../database/entities/professional-service.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { UsersService } from "../users/users.service";
import { SalonServicesRepository } from "./services.repository";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";

@Injectable()
export class ServicesService {
  constructor(
    private readonly tenantServices: SalonServicesRepository,
    // Junção (PK composta, sem id) → scoping manual por company_id.
    @InjectRepository(ProfessionalService)
    private readonly profServices: Repository<ProfessionalService>,
    private readonly tenantContext: TenantContextService,
    private readonly users: UsersService,
  ) {}

  /** Cria serviço tenant-scoped (AC2). `price` opcional (DL-030). */
  create(dto: CreateServiceDto): Promise<SalonService> {
    return this.tenantServices.save({
      name: dto.name,
      duration_minutes: dto.duration_minutes,
      // DECIMAL é string na entidade; null quando sem preço (DL-030).
      price: dto.price != null ? String(dto.price) : null,
      is_active: true,
    });
  }

  /** Edita serviço (AC2). id de outro tenant → 404. */
  async update(id: string, dto: UpdateServiceDto): Promise<SalonService> {
    const service = await this.tenantServices.findById(id);
    if (!service) {
      throw new NotFoundException();
    }
    if (dto.name !== undefined) {
      service.name = dto.name;
    }
    if (dto.duration_minutes !== undefined) {
      service.duration_minutes = dto.duration_minutes;
    }
    if (dto.price !== undefined) {
      // null limpa o preço (DL-030); número vira a string do DECIMAL.
      service.price = dto.price === null ? null : String(dto.price);
    }
    if (dto.is_active !== undefined) {
      service.is_active = dto.is_active;
    }
    return this.tenantServices.save(service);
  }

  /** Lista serviços do tenant; `activeOnly` exclui inativos (AC3). */
  list(activeOnly: boolean): Promise<SalonService[]> {
    return activeOnly
      ? this.tenantServices.findAll({ where: { is_active: true } })
      : this.tenantServices.findAll();
  }

  async findOne(id: string): Promise<SalonService> {
    const service = await this.tenantServices.findById(id);
    if (!service) {
      throw new NotFoundException();
    }
    return service;
  }

  /** Profissionais (ids) que executam o serviço (AC4), tenant-scoped. */
  async getProfessionals(serviceId: string): Promise<string[]> {
    await this.findOne(serviceId); // garante existência/tenant
    const companyId = this.tenantContext.getCompanyId();
    const rows = await this.profServices.find({
      where: { company_id: companyId, service_id: serviceId },
    });
    return rows.map((r) => r.professional_id);
  }

  /**
   * Define quais profissionais executam o serviço (AC4). Substitui o conjunto.
   * Só aceita usuários do tenant com `attends_clients = true` (DL-030).
   */
  async setProfessionals(
    serviceId: string,
    professionalIds: string[],
  ): Promise<string[]> {
    await this.findOne(serviceId);
    const companyId = this.tenantContext.getCompanyId();
    const ids = [...new Set(professionalIds)];

    if (ids.length > 0) {
      const attenderIds = new Set(
        (await this.users.listAttenders()).map((u) => u.id),
      );
      for (const pid of ids) {
        if (!attenderIds.has(pid)) {
          throw new BadRequestException(
            `Profissional ${pid} inválido (não atende clientes ou fora da instalação)`,
          );
        }
      }
    }

    await this.profServices.delete({
      company_id: companyId,
      service_id: serviceId,
    });
    if (ids.length > 0) {
      await this.profServices.insert(
        ids.map((pid) => ({
          professional_id: pid,
          service_id: serviceId,
          company_id: companyId,
        })),
      );
    }
    return this.getProfessionals(serviceId);
  }
}
