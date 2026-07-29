import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { ServicesService } from "../services/services.service";
import { UsersService } from "../users/users.service";

/** Branding público — SÓ os campos de marca (whitelist, sem PII/config — DL-034). */
export interface PublicInstallationView {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface PublicServiceView {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
}

export interface PublicProfessionalView {
  id: string;
  name: string;
}

/**
 * Leituras públicas da Story 5B.1. O tenant já foi resolvido pelo slug
 * (`PublicSlugTenantMiddleware`), então os services reusados aqui saem
 * tenant-scoped. Expõe SÓ o que o estabelecimento quer público: branding,
 * serviços ativos e profissionais ativos.
 */
@Injectable()
export class PublicBookingService {
  constructor(
    private readonly tenant: TenantContextService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly services: ServicesService,
    private readonly users: UsersService,
  ) {}

  async getInstallation(): Promise<PublicInstallationView> {
    const companyId = this.tenant.getCompanyId();
    const company = await this.companies.findOne({ where: { id: companyId } });
    // O middleware garante que existe; a checagem satisfaz o tipo.
    return {
      name: company?.name ?? "",
      logoUrl: company?.logo_url ?? null,
      primaryColor: company?.primary_color ?? null,
    };
  }

  async listServices(): Promise<{ services: PublicServiceView[] }> {
    const list = await this.services.list(true); // só ativos
    return {
      services: list.map((s) => ({
        id: String(s.id),
        name: s.name,
        durationMinutes: s.duration_minutes,
        price: s.price,
      })),
    };
  }

  async listProfessionals(): Promise<{ professionals: PublicProfessionalView[] }> {
    const list = await this.users.listAttenders(); // atende + ativo, tenant-scoped
    return {
      professionals: list.map((u) => ({ id: String(u.id), name: u.name })),
    };
  }
}
