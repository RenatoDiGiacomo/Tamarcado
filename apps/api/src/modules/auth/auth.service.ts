import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { Company } from "../../database/entities/company.entity";
import { User } from "../../database/entities/user.entity";
import { UsersService } from "../users/users.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

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
   * Resolve o tenant do login (DL-026/DL-050). Ordem:
   * 1. Com `companySlug` → resolve pela company do slug (não achou → 401
   *    "Credenciais inválidas", sem revelar se o tenant existe — sem enumeração).
   * 2. Sem slug → só resolve se `AUTH_ALLOW_SINGLE_TENANT` estiver LIGADA **e**
   *    existir exatamente uma company (conveniência de dev / deploy tenant-único).
   * 3. Caso contrário → 401 "Informe a instalação".
   *
   * Em produção multi-tenant a flag fica OFF: sem slug é SEMPRE 401. O painel
   * manda o slug pela rota `/app/{slug}/login` (DL-050). Isso remove o fallback
   * silencioso e dependente de estado que mascarava o bug 1.2.01.
   */
  private async resolveCompanyId(companySlug?: string): Promise<string> {
    if (companySlug) {
      const company = await this.companies.findOne({
        where: { slug: companySlug },
      });
      if (!company) {
        throw new UnauthorizedException("Credenciais inválidas");
      }
      return company.id;
    }
    if (this.singleTenantLoginAllowed()) {
      const companies = await this.companies.find({ take: 2 });
      if (companies.length === 1) {
        return companies[0].id;
      }
    }
    throw new UnauthorizedException("Informe a instalação (companySlug)");
  }

  /**
   * Conveniência de dev/tenant-único: permite login sem slug quando há UMA
   * company. Default OFF (seguro em produção); liga-se só via env em dev/CI.
   */
  private singleTenantLoginAllowed(): boolean {
    const flag = this.config.get<string>("AUTH_ALLOW_SINGLE_TENANT");
    return flag === "1" || flag === "true";
  }

  async validateUser(
    email: string,
    password: string,
    companySlug?: string,
  ): Promise<User | null> {
    const companyId = await this.resolveCompanyId(companySlug);
    const user = await this.users.findByCompanyAndEmail(companyId, email);
    if (!user || !user.is_active) {
      return null;
    }
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    return passwordOk ? user : null;
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
