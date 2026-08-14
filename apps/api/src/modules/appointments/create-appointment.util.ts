import type { Actor } from "../auth/actor.decorator";
import { utcToZonedParts } from "../availability/tz.util";

/**
 * Resolve quem atende (FR-D2/DL-009, revisado DL-062): quem NÃO gerencia a
 * agenda de toda a equipe cria **só para si** (ignora o que veio no body); quem
 * gerencia (`owner` ou `can_manage_all_appointments`) escolhe qualquer
 * profissional (ou `null` = não atribuído). Função pura — unit-testável.
 */
export function resolveProfessionalId(
  user: Actor,
  requested: string | null | undefined,
): string | null {
  if (!user.canManageAll) return user.userId;
  return requested ?? null;
}

/**
 * A data (civil, fuso do tenant) do agendamento é anterior a hoje? A criação
 * manual exige hoje-ou-futura (AC4). Compara só a DATA (não o horário) — marcar
 * mais cedo no mesmo dia é válido. Função pura (recebe `now`).
 */
export function isPastCivilDate(
  scheduledAt: Date,
  now: Date,
  timeZone: string,
): boolean {
  const target = utcToZonedParts(scheduledAt, timeZone).dateStr;
  const today = utcToZonedParts(now, timeZone).dateStr;
  return target < today; // 'YYYY-MM-DD' comparável lexicograficamente
}
