/**
 * Matemática pura de slots do `AvailabilityService` (Story 3.1) — sem I/O, para
 * testar exaustivamente a parte delicada. Tudo em minutos desde 00:00 no fuso
 * do tenant. Regras (DL-038 D4): passo da grade = duração do serviço; o
 * `interval` (slot_interval_minutes) é buffer exigido como gap entre atendimentos.
 */
export interface Interval {
  start: number;
  end: number;
}

/** Inícios candidatos (passo = duração) que cabem inteiros nas faixas de trabalho. */
export function generateStarts(windows: Interval[], duration: number): number[] {
  const out: number[] = [];
  if (duration <= 0) return out;
  for (const w of windows) {
    for (let s = w.start; s + duration <= w.end; s += duration) out.push(s);
  }
  return out;
}

/** O slot [s, s+duration] cabe inteiro em alguma faixa de trabalho? */
export function fitsInWindows(
  s: number,
  duration: number,
  windows: Interval[],
): boolean {
  return windows.some((w) => s >= w.start && s + duration <= w.end);
}

/**
 * O slot [s, s+duration] está livre? Exige gap ≥ `interval` de cada ocupado:
 * ou termina + buffer antes do início do ocupado, ou começa após o fim + buffer.
 */
export function isFree(
  s: number,
  duration: number,
  occupied: Interval[],
  interval: number,
): boolean {
  const end = s + duration;
  return occupied.every((o) => end + interval <= o.start || o.end + interval <= s);
}

/** Inícios livres numa faixa/dia: grade filtrada por ocupação (com buffer). */
export function freeStarts(
  windows: Interval[],
  occupied: Interval[],
  duration: number,
  interval: number,
): number[] {
  return generateStarts(windows, duration).filter((s) =>
    isFree(s, duration, occupied, interval),
  );
}
