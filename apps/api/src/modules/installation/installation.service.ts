import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { UpdateInstallationDto } from "./dto/update-installation.dto";

/**
 * Identidade visual da instalação (Story 1.7). Opera sobre `companies` (registro
 * de tenants) — NÃO é `TenantAwareRepository`. O isolamento vem de sempre usar
 * o `companyId` do token (o controller passa `req.user.companyId`), nunca um id
 * vindo do body (DL-034).
 */
@Injectable()
export class InstallationService {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  async get(companyId: string): Promise<Company> {
    const company = await this.companies.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException();
    }
    return company;
  }

  async update(
    companyId: string,
    dto: UpdateInstallationDto,
  ): Promise<Company> {
    const company = await this.get(companyId);
    if (dto.name !== undefined) {
      company.name = dto.name;
    }
    if (dto.logoUrl !== undefined) {
      company.logo_url = dto.logoUrl;
    }
    if (dto.primaryColor !== undefined) {
      company.primary_color = dto.primaryColor;
    }
    return this.companies.save(company);
  }
}
