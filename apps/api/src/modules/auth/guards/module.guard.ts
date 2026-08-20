import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  REQUIRE_MODULE_KEY,
  type ModuleName,
} from "../../../common/decorators/require-module.decorator";
import type { User } from "../../../database/entities/user.entity";

/** Coluna de flag por módulo na entidade `User`. */
const MODULE_FLAG: Record<ModuleName, keyof User> = {
  financeiro: "can_view_financeiro",
  dashboard: "can_view_dashboard",
  equipe: "can_view_equipe",
};

/**
 * Visibilidade de MÓDULO (DL-062). Roda DEPOIS do `ActiveUserGuard` (precisa da
 * linha fresca em `req.currentUser`). Sem `@RequireModule` no handler/classe →
 * libera. Com o decorator: `owner` passa sempre; senão exige o flag
 * `can_view_*` na LINHA FRESCA (não no token) → **403** se faltar.
 *
 * Ler da linha fresca é o que torna a revogação IMEDIATA: o Dono desliga o flag
 * e a próxima requisição já cai no 403, sem esperar relogar.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ModuleName | undefined>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }
    const { currentUser } = context
      .switchToHttp()
      .getRequest<{ currentUser?: User }>();
    if (!currentUser) {
      // Sem a linha fresca não há como afirmar acesso — nega por segurança.
      throw new ForbiddenException("Acesso ao módulo negado");
    }
    if (currentUser.access_level === "owner") {
      return true;
    }
    if (currentUser[MODULE_FLAG[required]] === true) {
      return true;
    }
    throw new ForbiddenException("Acesso ao módulo negado");
  }
}
