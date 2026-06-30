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
   * Resolve o tenant do login (DL-026): por slug informado ou, em deploy de
   * tenant único, a única company existente. Sem como resolver → 401.
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
    const companies = await this.companies.find({ take: 2 });
    if (companies.length === 1) {
      return companies[0].id;
    }
    throw new UnauthorizedException("Informe a instalação (companySlug)");
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
