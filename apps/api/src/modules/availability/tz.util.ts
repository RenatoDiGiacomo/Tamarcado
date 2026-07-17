/**
 * Utilitários de fuso horário para o cálculo de disponibilidade (ADR-008).
 * O banco opera em UTC; a lógica de dia/horário usa o `timezone` do tenant.
 * Sem dependências externas — usa a API nativa `Intl`. Correto sob DST (o
 * offset é resolvido para o instante); `America/Sao_Paulo` hoje não tem DST.
 */

/** Diferença (ms) entre o wall-time do instante no `timeZone` e o próprio UTC. */
function offsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  // '24' aparece em alguns engines para meia-noite; normaliza para 0.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    parts.minute,
    parts.second,
  );
  return asUTC - instant.getTime();
}

/** Dia da semana (0=Dom..6=Sáb) de uma data civil `YYYY-MM-DD` — independe de fuso. */
export function dayOfWeekOfLocalDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Minutos desde 00:00 de um horário `HH:MM` ou `HH:MM:SS`. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** `HH:MM` a partir de minutos desde 00:00. */
export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Converte um wall-time do tenant (data civil `YYYY-MM-DD` + minutos desde 00:00)
 * para o instante UTC correspondente. Ex.: 09:00 em America/Sao_Paulo (UTC-3) →
 * 12:00Z.
 */
export function zonedWallTimeToUtc(
  dateStr: string,
  minutesOfDay: number,
  timeZone: string,
): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // Resolve o offset no próprio instante (robusto a DST).
  const off = offsetMs(new Date(guess), timeZone);
  return new Date(guess - off);
}

/** Data civil (`YYYY-MM-DD`) e minutos-do-dia de um instante UTC no `timeZone`. */
export function utcToZonedParts(
  instant: Date,
  timeZone: string,
): { dateStr: string; minutesOfDay: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: Number(hour) * 60 + Number(parts.minute),
  };
}

/** Soma `days` dias a uma data civil `YYYY-MM-DD` (sem fuso). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
