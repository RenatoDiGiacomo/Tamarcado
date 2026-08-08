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
 *
 * O MESMO lookup por request valida a versão de sessão (1.2.04): se a senha foi
 * trocada/redefinida (que bumpa `token_version`), os access tokens antigos caem
 * na requisição seguinte — sem custo extra de banco além do já feito aqui.
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
    if (current.token_version !== user.tokenVersion) {
      throw new UnauthorizedException("Sessão expirada");
    }
    return true;
  }
}
