import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "../../database/entities/company.entity";
import { UsersService } from "../users/users.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { PasswordResetRequestDto } from "./dto/password-reset-request.dto";

export interface ProvisionResult {
  slug: string;
  painelUrl: string;
  publicUrl: string;
  inviteUrl: string;
}

export interface PasswordResetResult {
  resetUrl: string;
}

/**
 * Provisionamento de estabelecimento (Story 1.9), PRÉ-TENANT. Cria a company e
 * o convite do `owner` (reusando o fluxo de `user_invites` — o mesmo do
 * `POST /users/invite`). NÃO cria serviços/horários/dados de exemplo e NÃO
 * define senha (o dono define pelo link de aceite). Superfície mínima: só cria.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Gera um link de REDEFINIÇÃO de senha (1.9.01) para um usuário existente. O
   * operador dispara pelo Insomnia (protegido por `x-platform-key`) e repassa o
   * link ao dono, que define a própria senha — o operador NUNCA sabe a senha.
   * Link de uso único, expira em 1h; gerar um novo invalida o anterior.
   *
   * O mesmo token serve para a recuperação por E-MAIL futura — muda só o canal
   * de entrega (hoje devolvemos o link; amanhã um serviço de e-mail o envia).
   */
  async resetPassword(
    dto: PasswordResetRequestDto,
    ip: string,
  ): Promise<PasswordResetResult> {
    const company = await this.companies.findOne({ where: { slug: dto.slug } });
    if (!company) {
      throw new NotFoundException("Estabelecimento não encontrado.");
    }
    const user = await this.users.findByCompanyAndEmail(company.id, dto.email);
    if (!user) {
      throw new NotFoundException("Usuário não encontrado nesta empresa.");
    }

    const { link } = await this.users.createPasswordReset(company.id, user);
    // Auditoria de GERAÇÃO: quem (usuário-alvo), qual empresa, de onde, quando.
    this.logger.log(
      `password-reset generated: user=${user.id} email=${user.email} company=${company.slug} ip=${ip} at=${new Date().toISOString()}`,
    );
    return { resetUrl: link };
  }

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
