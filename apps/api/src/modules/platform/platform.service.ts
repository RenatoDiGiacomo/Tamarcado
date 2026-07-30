import { ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { UsersService } from "../users/users.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

export interface ProvisionResult {
  slug: string;
  painelUrl: string;
  publicUrl: string;
  inviteUrl: string;
}

/**
 * Provisionamento de estabelecimento (Story 1.9), PRÉ-TENANT. Cria a company e
 * o convite do `owner` (reusando o fluxo de `user_invites` — o mesmo do
 * `POST /users/invite`). NÃO cria serviços/horários/dados de exemplo e NÃO
 * define senha (o dono define pelo link de aceite). Superfície mínima: só cria.
 */
@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async provision(dto: CreateCompanyDto): Promise<ProvisionResult> {
    // O slug é a URL pública e o identificador de login — imutável na prática.
    const existing = await this.companies.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException("Slug já está em uso");
    }

    const company = await this.companies.save(
      this.companies.create({ name: dto.name, slug: dto.slug }),
    );

    // Convite do owner (auto-login no aceite define a senha). invited_by = null:
    // provisionamento de plataforma, sem usuário que convida.
    const { link: inviteUrl } = await this.users.createInviteForCompany(
      company.id,
      {
        name: dto.ownerName,
        email: dto.ownerEmail,
        access_level: "owner",
        attends_clients: true,
      },
      null,
    );

    const base = this.config.get<string>(
      "WEB_BASE_URL",
      "http://localhost:5173",
    );
    return {
      slug: company.slug,
      // Rota de login do painel por slug (DL-050) — funcional após o fix do
      // login multi-tenant (spec 1-2-01). Até lá, provisionar cliente real
      // fica bloqueado (ver epics.md).
      painelUrl: `${base}/app/${company.slug}/login`,
      publicUrl: `${base}/agendar/${company.slug}`,
      inviteUrl,
    };
  }
}
