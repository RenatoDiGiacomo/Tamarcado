import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { UsersService } from "../../users/users.service";
import type { AuthUser } from "../auth-user";

/**
 * Revogação de acesso imediata (AC6, FR-G4, DL-029 item 2). Roda DEPOIS do
 * `JwtAuthGuard` e DENTRO do contexto de tenant (o `TenantMiddleware` roda
 * antes dos guards). Busca o usuário tenant-scoped e nega 401 se inativo —
 * cortando o acesso na hora, sem esperar o token expirar.
 */
@Injectable()
export class ActiveUserGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser }>();
    if (!user) {
      throw new UnauthorizedException();
    }
    const current = await this.users.findById(user.userId);
    if (!current || !current.is_active) {
      throw new UnauthorizedException("Acesso revogado");
    }
    return true;
  }
}
