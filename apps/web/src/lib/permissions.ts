import type { CapabilityKey, CurrentUser } from "../auth/AuthContext";

/**
 * Espelho, no front, das regras do backend (DL-062). O `owner` IGNORA os flags
 * (sempre pode) — igual ao `toActor`/`ModuleGuard`. Servem para montar menu,
 * rotas e o que a Agenda mostra. **Segurança de verdade é no backend** (403);
 * isto é só UX — esconder o que a pessoa não pode usar.
 */

export type ModuleName = "financeiro" | "dashboard" | "equipe";

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
  if (module === "financeiro") return user.canViewFinanceiro;
  if (module === "dashboard") return user.canViewDashboard;
  return user.canViewEquipe;
}

/**
 * A EMPRESA contratou o recurso? (DL-072, Story 6.11.)
 *
 * TRÊS DIFERENÇAS para `canViewModule`, e nenhuma é detalhe:
 * 1. É por EMPRESA, não por pessoa — quem controla somos nós, não o dono.
 * 2. O `owner` NÃO passa por cima: não existe papel que compre recurso, e o dono
 *    de uma empresa sem o direito é justamente quem mais tentaria.
 * 3. Sem a capability o recurso aparece MARCADO com a coroa (Story 6.15), não
 *    sumido — aqui o objetivo é VENDER. É o oposto do módulo, onde esconder de
 *    quem não tem permissão é o comportamento certo (DL-062), porque lá é
 *    permissão interna da equipe.
 *
 * As duas verificações valem JUNTAS: a empresa precisa TER o recurso E a pessoa
 * precisa poder ver o módulo. E isto continua sendo só UX — a segurança é o 403.
 */
export function hasCapability(
  user: CurrentUser | null,
  capability: CapabilityKey,
): boolean {
  if (!user) return false;
  return user.companyCapabilities?.includes(capability) ?? false;
}
