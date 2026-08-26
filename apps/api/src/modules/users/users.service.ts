import {
  ConflictException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { User } from "../../database/entities/user.entity";
import type { AccessLevel, UserTheme } from "../../database/entities/user.entity";
import { UserInvite } from "../../database/entities/user-invite.entity";
import { Company } from "../../database/entities/company.entity";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { MailService } from "../mail/mail.service";
import { emailConviteEquipe } from "../mail/mail.templates";
import { UsersRepository } from "./users.repository";
import { InviteUserDto } from "./dto/invite-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

/** Convite válido por 7 dias (DL-029). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Link de redefinição de senha válido por 1 HORA (1.9.01). */
const RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
    // Convite por e-mail: o nome do estabelecimento entra na mensagem.
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly mail: MailService,
  ) {}

  /** Login (pré-tenant): lookup explícito por (company_id, email). */
  findByCompanyAndEmail(
    companyId: string,
    email: string,
  ): Promise<User | null> {
    return this.repo.findOne({ where: { company_id: companyId, email } });
  }

  /**
   * Login por e-mail (pré-tenant, DL-052): usuários ATIVOS com este e-mail em
   * QUALQUER empresa. O tenant do painel é resolvido pelo backend a partir do
   * e-mail (URL única, sem slug). Um resultado → login direto; vários → o front
   * pede a escolha do estabelecimento (e-mail é único por empresa, DL-026, então
   * a mesma pessoa pode atender em >1 salão).
   */
  findActiveByEmail(email: string): Promise<User[]> {
    return this.repo.find({ where: { email, is_active: true } });
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
   * Troca a própria senha (Perfil). Valida a senha ATUAL antes de aceitar
   * (400 "Senha atual incorreta." se não confere). A nova senha já vem validada
   * pela política do DTO (mín. 8, igual ao aceite de convite). Bumpa
   * `token_version` (1.2.04): derruba as OUTRAS sessões; o chamador reemite
   * tokens para ESTA sessão continuar. Devolve o usuário já salvo (nova versão).
   */
  async changeOwnPassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<User> {
    const user = await this.tenantUsers.findById(id);
    if (!user) {
      throw new NotFoundException();
    }
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
      throw new BadRequestException("Senha atual incorreta.");
    }
    user.password_hash = await bcrypt.hash(newPassword, 10);
    user.token_version += 1;
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
    const criado = await this.createInviteForCompany(
      companyId,
      {
        name: dto.name,
        email: dto.email,
        access_level: dto.access_level,
        attends_clients: dto.attends_clients,
      },
      invitedBy,
    );

    await this.enviarConvitePorEmail(companyId, criado.invite, criado.link);
    return criado;
  }

  /**
   * Manda o convite por e-mail. **Best-effort**: se o envio falhar, o convite
   * continua válido e o link segue na resposta — o dono copia e manda pelo
   * WhatsApp, como fazia antes. Por isso nada aqui lança.
   *
   * O link também continua sendo devolvido pela API de propósito: parte da
   * equipe não tem e-mail que confira, e mandar o link na mão continua sendo
   * um caminho legítimo.
   */
  private async enviarConvitePorEmail(
    companyId: string,
    invite: UserInvite,
    link: string,
  ): Promise<void> {
    const company = await this.companies.findOne({ where: { id: companyId } });
    const enviado = await this.mail.send(
      emailConviteEquipe({
        para: invite.email,
        nome: invite.name,
        estabelecimento: company?.name ?? "seu estabelecimento",
        link,
        diasParaExpirar: Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000)),
      }),
    );
    this.logger.log(
      `convite de equipe: invite=${invite.id} company=${companyId} entregue=${enviado}`,
    );
  }

  /**
   * Núcleo do convite, PRÉ-TENANT (companyId explícito). Reusado por
   * `createInvite` (tenant, do painel) e pelo provisionamento de plataforma
   * (Story 1.9, que convida o `owner` sem contexto de tenant). Usa só repos
   * CRUs (`repo`/`invites`) — nunca o tenant-scoped — para operar sem middleware.
   * Re-convidar o mesmo e-mail substitui o convite pendente anterior.
   */
  async createInviteForCompany(
    companyId: string,
    params: {
      name: string;
      email: string;
      access_level: AccessLevel;
      attends_clients: boolean;
    },
    invitedBy: string | null,
  ): Promise<{ invite: UserInvite; link: string }> {
    const existing = await this.repo.findOne({
      where: { company_id: companyId, email: params.email },
    });
    if (existing) {
      throw new ConflictException(
        "Já existe um usuário com esse e-mail nesta instalação",
      );
    }

    await this.invites.delete({
      company_id: companyId,
      email: params.email,
      accepted_at: IsNull(),
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invite = await this.invites.save(
      this.invites.create({
        company_id: companyId,
        email: params.email,
        name: params.name,
        access_level: params.access_level,
        attends_clients: params.attends_clients,
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
   * Link de REDEFINIÇÃO de senha (1.9.01), PRÉ-TENANT. Reusa a mecânica de
   * `user_invites` (token único hasheado + expiração + uso único), mas para um
   * usuário que JÁ EXISTE e com TTL curto (1 hora). Gera um link novo INVALIDA o
   * anterior do mesmo e-mail (delete dos pendentes). O canal de entrega é
   * separado: hoje o operador recebe o link e repassa; quando houver e-mail
   * configurado, basta enviar este mesmo `link` — nada aqui muda.
   */
  async createPasswordReset(
    companyId: string,
    user: User,
  ): Promise<{ link: string; token: string }> {
    // Invalida qualquer convite/reset pendente do mesmo e-mail nesta empresa.
    await this.invites.delete({
      company_id: companyId,
      email: user.email,
      accepted_at: IsNull(),
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await this.invites.save(
      this.invites.create({
        company_id: companyId,
        email: user.email,
        name: user.name,
        access_level: user.access_level,
        attends_clients: user.attends_clients,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + RESET_TTL_MS),
        accepted_at: null,
        invited_by: null,
      }),
    );

    const base = this.config.get<string>("WEB_BASE_URL", "http://localhost:5173");
    return { link: `${base}/definir-senha?token=${token}`, token };
  }

  /**
   * Aceita um convite/redefinição (pré-tenant): define a senha escolhida e marca
   * o token como usado. company_id vem do convite. Se o usuário JÁ EXISTE
   * (fluxo de reset — 1.9.01), ATUALIZA a senha; senão, CRIA (primeiro acesso,
   * AC1). `ip` entra na auditoria (quem usou o link, de onde).
   */
  async acceptInvite(token: string, password: string, ip?: string): Promise<User> {
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
    // Usuário já existe naquela empresa? → REDEFINE a senha (não recria; não
    // mexe em papel/ativação). Senão, CRIA no primeiro acesso.
    const existing = await this.repo.findOne({
      where: { company_id: invite.company_id, email: invite.email },
    });
    let user: User;
    if (existing) {
      existing.password_hash = passwordHash;
      // Reset (1.9.01): redefinir a senha bumpa a versão de sessão (1.2.04) —
      // derruba as sessões antigas do dono. O login logo abaixo já emite tokens
      // com a versão nova, então quem acabou de definir a senha entra normal.
      existing.token_version += 1;
      user = await this.repo.save(existing);
    } else {
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
    }

    invite.accepted_at = new Date();
    await this.invites.save(invite);
    // Auditoria de USO do link (senha definida): quem, qual empresa, de onde.
    this.logger.log(
      `password-set: user=${user.id} email=${user.email} company=${user.company_id} reused=${existing ? "reset" : "invite"} ip=${ip ?? "?"}`,
    );
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
    // Flags de permissão (DL-062): só valem para Gestão. O `owner` IGNORA os
    // flags (sempre pode) — por isso NÃO os persistimos nele. Consequência: um
    // Dono não consegue remover o próprio acesso (AC5), mesmo que o body tente.
    if (user.access_level !== "owner") {
      if (dto.can_view_financeiro !== undefined) {
        user.can_view_financeiro = dto.can_view_financeiro;
      }
      if (dto.can_view_dashboard !== undefined) {
        user.can_view_dashboard = dto.can_view_dashboard;
      }
      if (dto.can_view_equipe !== undefined) {
        user.can_view_equipe = dto.can_view_equipe;
      }
      if (dto.can_manage_all_appointments !== undefined) {
        user.can_manage_all_appointments = dto.can_manage_all_appointments;
      }
    }
    return this.tenantUsers.save(user);
  }
}
