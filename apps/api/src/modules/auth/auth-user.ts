import type { AccessLevel } from "../../database/entities/user.entity";

/** Shape do `req.user` após o JwtAuthGuard (saída do JwtStrategy.validate). */
export interface AuthUser {
  userId: string;
  companyId: string;
  accessLevel: AccessLevel;
  attendsClients: boolean;
}
