import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../../../common/decorators/roles.decorator";
import type { AccessLevel } from "../../../database/entities/user.entity";
import type { AuthUser } from "../auth-user";
import { RoleAccessDeniedException } from "../../../common/errors/forbidden-reason";

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
      // 403 MARCADO com `reason: "role"` (Story 6.15). É o TERCEIRO motivo de
      // 403 do sistema; sem a marca ele voltaria a cair no "erro de servidor"
      // genérico do front — o defeito que a 6.15 existe para fechar.
      throw new RoleAccessDeniedException();
    }
    return true;
  }
}
