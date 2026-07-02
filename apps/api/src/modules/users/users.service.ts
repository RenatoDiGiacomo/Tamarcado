import {
  ConflictException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { User } from "../../database/entities/user.entity";
import type { UserTheme } from "../../database/entities/user.entity";
import { UserInvite } from "../../database/entities/user-invite.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { UsersRepository } from "./users.repository";
import { InviteUserDto } from "./dto/invite-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

/** Convite válido por 7 dias (DL-029). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  constructor(
    // Repositório CRU (sem tenant) — usado SÓ no login e no aceite de convite,
    // que são pré-tenant (DL-026) e resolvem company_id explicitamente.
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    // Convites: CRU (aceite é pré-tenant); criação carimba company_id do contexto.
    @InjectRepository(UserInvite)
    private readonly invites: Repository<UserInvite>,
    // Repositório tenant-aware — usado nas rotas autenticadas (tenant no contexto).
    private readonly tenantUsers: UsersRepository,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
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

  /** Tenant-scoped: usuários com agenda própria e ativos (AC4 — consumo Épico 2). */
  listAttenders(): Promise<User[]> {
    return this.tenantUsers.findAll({
      where: { attends_clients: true, is_active: true },
    });
  }

  /** Tenant-scoped: define o intervalo entre atendimentos do profissional (Story 1.6). */
  async setSlotInterval(id: string, minutes: number): Promise<User> {
    const user = await this.tenantUsers.findById(id);
    if (!user) {
      throw new NotFoundException();
    }
    user.slot_interval_minutes = minutes;
    return this.tenantUsers.save(user);
  }

  /** Tenant-scoped: preferência de tema do próprio usuário (Story 1.7, DL-021/DL-034). */
  async setTheme(id: string, theme: UserTheme): Promise<User> {
    const user = await this.tenantUsers.findById(id);
    if (!user) {
      throw new NotFoundException();
    }
    user.theme = theme;
    return this.tenantUsers.save(user);
  }

  /**
   * Cria um convite tenant-scoped e devolve o link de aceite (AC1, DL-029).
   * O token em claro só existe aqui; o banco guarda só o hash. Re-convidar o
   * mesmo e-mail substitui o convite pendente anterior.
   */
  async createInvite(
    dto: InviteUserDto,
    invitedBy: string,
  ): Promise<{ invite: UserInvite; link: string }> {
    const companyId = this.tenantContext.getCompanyId();

    const existing = await this.tenantUsers.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        "Já existe um usuário com esse e-mail nesta instalação",
      );
    }

    await this.invites.delete({
      company_id: companyId,
      email: dto.email,
      accepted_at: IsNull(),
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invite = await this.invites.save(
      this.invites.create({
        company_id: companyId,
        email: dto.email,
        name: dto.name,
        access_level: dto.access_level,
        attends_clients: dto.attends_clients,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + INVITE_TTL_MS),
        accepted_at: null,
        invited_by: invitedBy,
      }),
    );

    const base = this.config.get<string>("WEB_BASE_URL", "http://localhost:5173");
    return { invite, link: `${base}/aceitar-convite?token=${token}` };
  }

  /**
   * Aceita um convite (pré-tenant): cria o usuário com a senha escolhida e
   * marca o convite como usado (AC1). company_id vem do convite.
   */
  async acceptInvite(token: string, password: string): Promise<User> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invite = await this.invites.findOne({
      where: { token_hash: tokenHash },
    });
    if (
      !invite ||
      invite.accepted_at !== null ||
      invite.expires_at.getTime() < Date.now()
    ) {
      throw new BadRequestException("Convite inválido ou expirado");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let user: User;
    try {
      user = await this.repo.save(
        this.repo.create({
          company_id: invite.company_id,
          name: invite.name,
          email: invite.email,
          password_hash: passwordHash,
          access_level: invite.access_level,
          attends_clients: invite.attends_clients,
          theme: "light",
          is_active: true,
        }),
      );
    } catch {
      // Colisão de uq_users_tenant_email (company_id, email).
      throw new ConflictException("Usuário já existe nesta instalação");
    }

    invite.accepted_at = new Date();
    await this.invites.save(invite);
    return user;
  }

  /**
   * Edita um usuário do tenant (AC2/AC5/AC6). Bloqueia rebaixar ou desativar o
   * ÚNICO Dono ativo (FR-I3) — a transferência de titularidade é manual na 1.4
   * (DL-029 item 4). Não é possível promover a `owner` por aqui (DTO).
   */
  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.tenantUsers.findById(id);
    if (!user) {
      throw new NotFoundException();
    }

    // dto.access_level só pode ser manager/basic (DTO) → qualquer mudança a
    // partir de owner é um rebaixamento.
    const demotingOwner =
      user.access_level === "owner" && dto.access_level !== undefined;
    const deactivatingOwner =
      user.access_level === "owner" && dto.is_active === false;
    if (demotingOwner || deactivatingOwner) {
      const activeOwners = await this.tenantUsers.count({
        where: { access_level: "owner", is_active: true },
      });
      if (activeOwners <= 1) {
        throw new ConflictException(
          "Não é possível rebaixar ou desativar o único Dono. Transfira a titularidade antes.",
        );
      }
    }

    if (dto.access_level !== undefined) {
      user.access_level = dto.access_level;
    }
    if (dto.attends_clients !== undefined) {
      user.attends_clients = dto.attends_clients;
    }
    if (dto.is_active !== undefined) {
      user.is_active = dto.is_active;
    }
    return this.tenantUsers.save(user);
  }
}
