import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../../../common/decorators/roles.decorator";
import type { AccessLevel } from "../../../database/entities/user.entity";
import type { AuthUser } from "../auth-user";

/**
 * Autorização por `access_level` (matriz FR-I2). Roda DEPOIS do `JwtAuthGuard`
 * (precisa de `req.user`). Sem `@Roles` no handler/classe → libera; nível
 * insuficiente → 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccessLevel[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    if (!user || !required.includes(user.accessLevel)) {
      throw new ForbiddenException("Acesso negado para o seu nível");
    }
    return true;
  }
}
