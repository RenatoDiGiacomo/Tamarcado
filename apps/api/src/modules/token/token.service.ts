import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { User } from "../../database/entities/user.entity";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Payload do refresh, já com a versão de sessão normalizada (1.2.04). */
export interface RefreshPayload {
  sub: string;
  tokenVersion: number;
}

/**
 * Emissão/verificação de tokens (1.2.04). Isolado num módulo próprio (sem
 * dependência de UsersService) para ser reusado tanto pelo AuthService quanto
 * pela troca de senha do Perfil (UsersController) SEM ciclo de módulos —
 * AuthModule importa UsersModule, então o emissor não pode morar no AuthModule.
 *
 * `tokenVersion` viaja no access E no refresh; a validação da versão fecha a
 * janela entre a troca de senha e a expiração natural do token.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Access token (TTL curto do JwtModule) com a versão de sessão no payload. */
  signAccess(user: User): string {
    return this.jwt.sign({
      sub: user.id,
      companyId: user.company_id,
      accessLevel: user.access_level,
      attendsClients: user.attends_clients,
      tokenVersion: user.token_version,
    });
  }

  /** Par access + refresh; ambos carimbam a versão de sessão atual do usuário. */
  issue(user: User): AuthTokens {
    return {
      accessToken: this.signAccess(user),
      refreshToken: this.jwt.sign(
        { sub: user.id, tokenVersion: user.token_version },
        {
          secret: this.config.get<string>("JWT_REFRESH_SECRET"),
          // segundos (jsonwebtoken aceita number = segundos); default 7 dias
          expiresIn: Number(this.config.get<string>("JWT_REFRESH_TTL", "604800")),
        },
      ),
    };
  }

  /**
   * Verifica assinatura/expiração do refresh e devolve o payload normalizado.
   * Lança se inválido. `tokenVersion` ausente (refresh emitido antes da 1.2.04)
   * é tratado como 0 — casa com o default da coluna, mantendo tokens em uso.
   */
  verifyRefresh(token: string): RefreshPayload {
    const payload = this.jwt.verify<{ sub: string; tokenVersion?: number }>(
      token,
      { secret: this.config.get<string>("JWT_REFRESH_SECRET") },
    );
    return { sub: payload.sub, tokenVersion: payload.tokenVersion ?? 0 };
  }
}