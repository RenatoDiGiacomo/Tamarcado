import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { Company } from "../../database/entities/company.entity";
import { User } from "../../database/entities/user.entity";
import { UsersService } from "../users/users.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Estabelecimento oferecido na desambiguação de e-mail (DL-052). */
export interface CompanyChoice {
  id: string;
  name: string;
}

/** Resultado do login: ou entra (tokens) ou pede escolha do estabelecimento. */
export type LoginOutcome = AuthTokens | { companies: CompanyChoice[] };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  /**
   * Login do painel (DL-052): tenant resolvido pelo BACKEND a partir do e-mail —
   * URL única, sem slug. Fluxo:
   * 1. Com `companyId` (escolha da desambiguação) → valida e-mail+senha NAQUELE
   *    tenant → tokens ou 401.
   * 2. Sem `companyId` → busca usuários ativos com o e-mail em todas as empresas:
   *    - 0 → 401 (sem revelar se o e-mail existe).
   *    - 1 → valida a senha → tokens ou 401.
   *    - >1 → devolve a lista de empresas para o front escolher; a senha só é
   *      validada DEPOIS da escolha, por tenant (DL-052).
   *
   * O e-mail é único POR empresa (DL-026), não global — daí a desambiguação.
   */
  async attemptLogin(
    email: string,
    password: string,
    companyId?: string,
  ): Promise<LoginOutcome> {
    if (companyId) {
      const user = await this.users.findByCompanyAndEmail(companyId, email);
      return this.tokensIfPasswordOk(user, password);
    }

    const users = await this.users.findActiveByEmail(email);
    if (users.length === 0) {
      throw new UnauthorizedException("Credenciais inválidas");
    }
    if (users.length === 1) {
      return this.tokensIfPasswordOk(users[0], password);
    }
    // Desambiguação: mesma pessoa/e-mail em >1 empresa. Lista os nomes; a senha
    // é validada só após a escolha (passo 1 acima).
    const companies = await this.companies.find({
      where: { id: In(users.map((u) => u.company_id)) },
    });
    return {
      companies: companies
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** Emite tokens se o usuário existe, está ativo e a senha confere; senão 401. */
  private async tokensIfPasswordOk(
    user: User | null,
    password: string,
  ): Promise<AuthTokens> {
    const ok =
      user !== null &&
      user.is_active &&
      (await bcrypt.compare(password, user.password_hash));
    if (!ok || user === null) {
      throw new UnauthorizedException("Credenciais inválidas");
    }
    return this.login(user);
  }

  login(user: User): AuthTokens {
    const accessToken = this.jwt.sign({
      sub: user.id,
      companyId: user.company_id,
      accessLevel: user.access_level,
      attendsClients: user.attends_clients,
    });
    const refreshToken = this.jwt.sign(
      { sub: user.id },
      {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        // segundos (jsonwebtoken aceita number = segundos); default 7 dias
        expiresIn: Number(this.config.get<string>("JWT_REFRESH_TTL", "604800")),
      },
    );
    return { accessToken, refreshToken };
  }

  /**
   * Aceite de convite (pré-tenant, AC1): cria o usuário com a senha escolhida
   * e já devolve os tokens (auto-login no primeiro acesso).
   */
  async acceptInvite(token: string, password: string): Promise<AuthTokens> {
    const user = await this.users.acceptInvite(token, password);
    return this.login(user);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let sub: string;
    try {
      const payload = this.jwt.verify<{ sub: string }>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException("Refresh token inválido");
    }
    // Refresh é pré-tenant (sem middleware/contexto): lookup sem escopo.
    const user = await this.users.findByIdUnscoped(sub);
    if (!user || !user.is_active) {
      throw new UnauthorizedException("Refresh token inválido");
    }
    const accessToken = this.jwt.sign({
      sub: user.id,
      companyId: user.company_id,
      accessLevel: user.access_level,
      attendsClients: user.attends_clients,
    });
    return { accessToken };
  }
}
