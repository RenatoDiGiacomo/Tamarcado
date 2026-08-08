import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AuthUser } from "../auth-user";
import type { AccessLevel } from "../../../database/entities/user.entity";

interface AccessTokenPayload {
  sub: string;
  companyId: string;
  accessLevel: AccessLevel;
  attendsClients: boolean;
  /** Ausente em tokens emitidos antes da 1.2.04 → tratado como 0. */
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>("JWT_SECRET");
    if (!secret) {
      throw new Error("JWT_SECRET não configurado");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /** Payload validado → req.user (NFR-S3, DL-022). */
  validate(payload: AccessTokenPayload): AuthUser {
    return {
      userId: payload.sub,
      companyId: payload.companyId,
      accessLevel: payload.accessLevel,
      attendsClients: payload.attendsClients,
      tokenVersion: payload.tokenVersion ?? 0,
    };
  }
}
