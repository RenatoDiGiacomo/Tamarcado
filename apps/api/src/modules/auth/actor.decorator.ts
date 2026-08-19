import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AccessLevel, User } from "../../database/entities/user.entity";

/**
 * Identidade + permissões de AÇÃO lidas da LINHA FRESCA (`req.currentUser`,
 * anexada pelo `ActiveUserGuard`). Diferente de `@CurrentUser()` (que vem do
 * TOKEN): aqui `accessLevel` e `canManageAll` refletem o banco AGORA, então uma
 * revogação vale na requisição seguinte, sem relogar (DL-062).
 *
 * `canManageAll` = `owner` (sempre) OU o flag `can_manage_all_appointments`.
 * É o que substitui o antigo `accessLevel === "basic"` na Agenda: sem ele, a
 * pessoa opera só os próprios agendamentos; com ele, os de toda a equipe.
 */
export interface Actor {
  userId: string;
  companyId: string;
  accessLevel: AccessLevel;
  canManageAll: boolean;
  /**
   * Acesso ao módulo Financeiro (owner OU `can_view_financeiro`). É o corte de
   * VALOR (DL-062): dados de valor só entram no payload quando isto é `true`.
   */
  canViewFinanceiro: boolean;
}

export function toActor(current: User): Actor {
  const isOwner = current.access_level === "owner";
  return {
    userId: current.id,
    companyId: current.company_id,
    accessLevel: current.access_level,
    canManageAll: isOwner || current.can_manage_all_appointments,
    canViewFinanceiro: isOwner || current.can_view_financeiro,
  };
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const { currentUser } = ctx
      .switchToHttp()
      .getRequest<{ currentUser?: User }>();
    if (!currentUser) {
      throw new Error(
        "CurrentActor exige o ActiveUserGuard (req.currentUser ausente).",
      );
    }
    return toActor(currentUser);
  },
);
