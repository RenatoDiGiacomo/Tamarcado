/** Núcleo puro da tela Configurações → Horários (Story 3.3.2). Reconstrói os 7
 *  dias (o GET traz só os gravados), monta o body do PUT e valida a faixa. */

/** Dia como vem/vai da API `/schedules/:id`. */
export interface ApiDay {
  dayOfWeek: number; // 0=Dom..6=Sáb
  startTime: string; // "HH:MM[:SS]"
  endTime: string;
  isActive: boolean;
}

/** Linha do editor (uma por dia da semana). */
export interface DayRow {
  dayOfWeek: number;
  active: boolean;
  start: string; // "HH:MM"
  end: string;
}

/** Ordem de exibição: Segunda → Domingo (day_of_week 1..6, depois 0). */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_LABELS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

const hhmm = (t: string): string => t.slice(0, 5);
const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Reconstrói os 7 dias na ordem Seg→Dom; ausentes = inativos (default 09–18h). */
export function buildWeek(apiDays: ApiDay[]): DayRow[] {
  return DAY_ORDER.map((dow) => {
    const f = apiDays.find((d) => d.dayOfWeek === dow);
    return {
      dayOfWeek: dow,
      active: f?.isActive ?? false,
      start: hhmm(f?.startTime ?? "09:00:00"),
      end: hhmm(f?.endTime ?? "18:00:00"),
    };
  });
}

/** Body do `PUT /schedules/:id` — envia os 7 dias (o backend substitui tudo). */
export function toPutBody(
  week: DayRow[],
  intervalMinutes: number,
): {
  interval_minutes: number;
  days: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
  }>;
} {
  return {
    interval_minutes: intervalMinutes,
    days: week.map((d) => ({
      day_of_week: d.dayOfWeek,
      start_time: d.start,
      end_time: d.end,
      is_active: d.active,
    })),
  };
}

/** Valida `fim > início` nos dias ativos; retorna a mensagem do 1º erro ou null. */
export function validateWeek(week: DayRow[]): string | null {
  for (const d of week) {
    if (d.active && toMin(d.end) <= toMin(d.start)) {
      const label = DAY_LABELS[DAY_ORDER.indexOf(d.dayOfWeek)];
      return `${label}: o horário de fim deve ser após o início.`;
    }
  }
  return null;
}

/** Um profissional "tem horários" se há ≥1 dia ativo (senão a agenda não oferece slot). */
export function hasSchedule(apiDays: ApiDay[]): boolean {
  return apiDays.some((d) => d.isActive);
}
