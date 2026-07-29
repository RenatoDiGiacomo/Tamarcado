import type { AgendaAppointment, AgendaView } from "../components/agenda/AgendaGrid";
import type { AppointmentStatus } from "../components/StatusChip";

/** Item cru da API (`GET /appointments`). Status/source no formato do backend. */
export interface ApiAppointment {
  id: string;
  clientName: string;
  serviceId: string; // 3.5: busca quem executa o serviço p/ destacar no select
  serviceName: string;
  professionalId: string | null; // 3.5: pré-seleciona o profissional atual
  professionalName: string | null;
  date: string; // YYYY-MM-DD (fuso do tenant)
  start: string; // HH:MM
  end: string; // HH:MM
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  source: "whatsapp" | "manual" | "app" | "link"; // 5B.2: link público
}

const STATUS_MAP: Record<ApiAppointment["status"], AppointmentStatus> = {
  pending: "pending",
  confirmed: "confirmed",
  cancelled: "cancelled",
  completed: "done",
  no_show: "noshow",
};

/** Status do backend → status do StatusChip (`completed→done`, `no_show→noshow`). */
export function mapStatus(status: ApiAppointment["status"]): AppointmentStatus {
  return STATUS_MAP[status];
}

/** Origem do card (lápis/balão): whatsapp é balão; o resto (manual/app) é lápis. */
export function mapOrigin(
  source: ApiAppointment["source"],
): "whatsapp" | "manual" {
  return source === "whatsapp" ? "whatsapp" : "manual";
}

/** Dia da semana de `YYYY-MM-DD` na convenção da grade: 0=Seg .. 6=Dom. */
export function weekdayMon(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom..6=Sáb
  return (js + 6) % 7; // desloca para 0=Seg..6=Dom
}

/** Item da API → agendamento da casca `AgendaGrid`. */
export function toAgendaAppointment(item: ApiAppointment): AgendaAppointment {
  return {
    id: item.id,
    clientName: item.clientName,
    serviceName: item.serviceName,
    start: item.start,
    end: item.end,
    status: mapStatus(item.status),
    origin: mapOrigin(item.source),
    professionalName: item.professionalName,
    weekday: weekdayMon(item.date),
  };
}

const DAY_MS = 86400000;

function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Segunda-feira da semana civil que contém `dateStr`. */
export function mondayOf(dateStr: string): string {
  const dow = weekdayMon(dateStr); // 0=Seg
  return toIso(new Date(toDate(dateStr).getTime() - dow * DAY_MS));
}

/**
 * Período `[from, to]` (datas civis, inclusivo) a buscar para a âncora e a visão.
 * Dia → só a âncora; Semana → segunda a domingo da semana da âncora.
 */
export function periodRange(
  anchor: string,
  view: AgendaView,
): { from: string; to: string } {
  if (view === "dia") return { from: anchor, to: anchor };
  const from = mondayOf(anchor);
  const to = toIso(new Date(toDate(from).getTime() + 6 * DAY_MS));
  return { from, to };
}

/** Move a âncora: ±1 dia (visão dia) ou ±7 dias (visão semana). */
export function shiftAnchor(
  anchor: string,
  view: AgendaView,
  dir: 1 | -1,
): string {
  const step = view === "dia" ? 1 : 7;
  return toIso(new Date(toDate(anchor).getTime() + dir * step * DAY_MS));
}

const WD_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function ddmm(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

/** Rótulo do cabeçalho: "Seg, 20/07" (dia) ou "20/07 – 26/07" (semana). */
export function formatDateLabel(anchor: string, view: AgendaView): string {
  if (view === "dia") {
    return `${WD_SHORT[weekdayMon(anchor)]}, ${ddmm(anchor)}`;
  }
  const { from, to } = periodRange(anchor, view);
  return `${ddmm(from)} – ${ddmm(to)}`;
}

/** Data civil de hoje (`YYYY-MM-DD`) no fuso do navegador. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
