import type { CurrentUser } from "../auth/AuthContext";

/**
 * Espelho, no front, das regras do backend (DL-062). O `owner` IGNORA os flags
 * (sempre pode) — igual ao `toActor`/`ModuleGuard`. Servem para montar menu,
 * rotas e o que a Agenda mostra. **Segurança de verdade é no backend** (403);
 * isto é só UX — esconder o que a pessoa não pode usar.
 */

export type ModuleName = "financeiro" | "dashboard";

/** Opera a agenda de TODA a equipe? owner OU `can_manage_all_appointments`. */
export function canManageAllAppointments(user: CurrentUser | null): boolean {
  if (!user) return false;
  return user.accessLevel === "owner" || user.canManageAllAppointments;
}

/** Enxerga o módulo? owner OU o flag `can_view_<module>`. */
export function canViewModule(
  user: CurrentUser | null,
  module: ModuleName,
): boolean {
  if (!user) return false;
  if (user.accessLevel === "owner") return true;
  return module === "financeiro"
    ? user.canViewFinanceiro
    : user.canViewDashboard;
}
