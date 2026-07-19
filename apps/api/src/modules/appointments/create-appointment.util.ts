import type { AuthUser } from "../auth/auth-user";
import { utcToZonedParts } from "../availability/tz.util";

/**
 * Resolve quem atende (FR-D2/DL-009): `basic` cria **só para si** (ignora o que
 * veio no body); `owner`/`manager` escolhem qualquer profissional (ou `null` =
 * não atribuído). Função pura — unit-testável.
 */
export function resolveProfessionalId(
  user: AuthUser,
  requested: string | null | undefined,
): string | null {
  if (user.accessLevel === "basic") return user.userId;
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
