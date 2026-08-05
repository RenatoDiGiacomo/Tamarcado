import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusChip } from "../StatusChip";
import type { AgendaAppointment, AgendaView } from "./AgendaGrid";
import { useMonthAppointments } from "./useAgenda";

const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"]; // Seg-first
const WD_FULL = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** "YYYY-MM-DD" → Date local (meio-dia, evita salto de fuso). */
function parse(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 12);
}
function iso(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
/** Índice do dia da semana com SEGUNDA = 0 … DOMINGO = 6. */
function mondayIdx(dt: Date): number {
  return (dt.getDay() + 6) % 7;
}
function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}
function dayHeader(d: string): string {
  const dt = parse(d);
  return `${WD_FULL[mondayIdx(dt)]}, ${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

interface CalCell {
  date: string;
  day: number;
  inMonth: boolean;
}

/** Grade do mês (Seg-first), com dias de meses vizinhos preenchendo as bordas. */
function monthGrid(ym: string): CalCell[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1, 12);
  const lead = mondayIdx(first);
  const start = new Date(y, m - 1, 1 - lead, 12);
  const cells: CalCell[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
      12,
    );
    cells.push({
      date: iso(dt),
      day: dt.getDate(),
      inMonth: dt.getMonth() === m - 1,
    });
  }
  // corta a 6ª semana se ela for inteiramente do próximo mês
  return cells.slice(0, cells.slice(35).every((c) => !c.inMonth) ? 35 : 42);
}

function OriginIcon({ origin }: { origin: "whatsapp" | "manual" }) {
  return origin === "manual" ? (
    <Pencil
      className="size-3.5 shrink-0 text-muted-foreground"
      aria-label="Manual"
    />
  ) : (
    <MessageCircle
      className="size-3.5 shrink-0 text-muted-foreground"
      aria-label="WhatsApp"
    />
  );
}

function ApptCard({
  appt,
  onSelect,
}: {
  appt: AgendaAppointment;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(appt.id)}
      className={cn(
        "grid w-full grid-cols-[52px_1fr_auto] items-start gap-2.5 rounded-xl border border-l-4 border-border bg-card p-3 text-left",
        STATUS_BORDER[appt.status],
      )}
    >
      <span className="text-base font-bold tabular-nums">{appt.start}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <OriginIcon origin={appt.origin} />
          <span
            className={cn(
              "truncate font-semibold",
              appt.status === "cancelled" && "line-through",
            )}
          >
            {appt.clientName}
          </span>
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          {appt.start}–{appt.end} · {appt.serviceName}
        </span>
        <span
          className={cn(
            "block truncate text-sm",
            appt.professionalName
              ? "text-muted-foreground"
              : "italic text-muted-foreground/70",
          )}
        >
          {appt.professionalName ?? "Não atribuído"}
        </span>
      </span>
      <StatusChip status={appt.status} />
    </button>
  );
}

const STATUS_BORDER: Record<AgendaAppointment["status"], string> = {
  pending: "border-l-status-pending",
  confirmed: "border-l-status-confirmed",
  done: "border-l-status-done",
  cancelled: "border-l-status-cancelled",
  noshow: "border-l-status-noshow",
};

/** Preenchimento do dia no calendário pela cor do status. */
const STATUS_BG: Record<AgendaAppointment["status"], string> = {
  pending: "bg-status-pending",
  confirmed: "bg-status-confirmed",
  done: "bg-status-done",
  cancelled: "bg-status-cancelled",
  noshow: "bg-status-noshow",
};

export interface AgendaListProps {
  /** Dia selecionado, "YYYY-MM-DD". */
  anchor: string;
  view: AgendaView;
  onViewChange: (v: AgendaView) => void;
  /** Agendamentos do período em foco (dia OU semana), já mapeados. */
  appointments: AgendaAppointment[];
  onSelectDay: (date: string) => void;
  onSelectAppointment: (id: string) => void;
  onNew: () => void;
  /** Bumpa a cada mutação → recarrega os pontos/cores do mês na hora. */
  dataVersion?: number;
}

/**
 * Agenda no CELULAR (Épico 7 / painel-mobile §5): calendário do mês no topo +
 * LISTA do dia (não grade). Pura apresentação: recebe dados e callbacks; a
 * lógica vive em `useAgenda`. Desktop usa `AgendaGrid` (a rota escolhe).
 */
export function AgendaList({
  anchor,
  view,
  onViewChange,
  appointments,
  onSelectDay,
  onSelectAppointment,
  onNew,
  dataVersion,
}: AgendaListProps) {
  const [month, setMonth] = useState(() => anchor.slice(0, 7));
  // O calendário segue o mês do dia selecionado quando ele muda.
  useEffect(() => setMonth(anchor.slice(0, 7)), [anchor]);
  // `dataVersion` bumpa a cada mutação → recarrega os pontos/cores do mês.
  const withAppts = useMonthAppointments(month, dataVersion);
  const cells = monthGrid(month);
  const [my, mm] = month.split("-").map(Number);
  const today = iso(new Date());

  const sorted = [...appointments].sort((x, y) =>
    x.start.localeCompare(y.start),
  );

  // Visão Semana: agrupa por dia (weekday 0=Seg..6=Dom) com cabeçalho de data.
  const weekStartDt = (() => {
    const dt = parse(anchor);
    return new Date(
      dt.getFullYear(),
      dt.getMonth(),
      dt.getDate() - mondayIdx(dt),
      12,
    );
  })();
  const weekGroups = WD_FULL.map((_, i) => {
    const dayIso = iso(
      new Date(
        weekStartDt.getFullYear(),
        weekStartDt.getMonth(),
        weekStartDt.getDate() + i,
        12,
      ),
    );
    const items = sorted.filter((ap) => (ap.weekday ?? -1) === i);
    return { dayIso, items };
  }).filter((g) => g.items.length > 0);

  return (
    <div>
      {/* Calendário do mês */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="text-sm font-bold">
            {MONTHS[mm - 1]} {my}
          </span>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((w, i) => (
            <span
              key={i}
              className="pb-1 text-[10px] font-bold text-muted-foreground"
            >
              {w}
            </span>
          ))}
          {cells.map((c) => {
            const selected = c.date === anchor;
            // Status representativo do dia (§5): define a COR do dia.
            const status = withAppts.get(c.date);
            return (
              <button
                key={c.date}
                type="button"
                onClick={() => onSelectDay(c.date)}
                aria-label={c.date}
                aria-current={selected ? "date" : undefined}
                className={cn(
                  "relative mx-auto grid size-9 place-items-center rounded-[10px] text-[13px]",
                  // COR = status, SEMPRE (selecionado ou não). Dia sem
                  // agendamento = neutro.
                  status
                    ? cn(STATUS_BG[status], "text-white")
                    : c.inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/40",
                  // Hoje: número em negrito (marca leve, não conflita com o anel).
                  c.date === today && "font-bold",
                  // SELEÇÃO = anel; o dia mantém a cor do próprio status por baixo.
                  selected &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
              >
                {c.day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar única mantida — Dia | Semana */}
      <div className="mb-3 inline-flex overflow-hidden rounded-md border border-border">
        {(["dia", "semana"] as AgendaView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={cn(
              "px-3 py-1.5 text-sm font-semibold transition-colors",
              view === v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {v === "dia" ? "Dia" : "Semana"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {view === "dia" ? (
        sorted.length === 0 ? (
          <ListEmpty onNew={onNew} />
        ) : (
          <>
            <p className="mb-2 px-1 text-xs font-bold text-muted-foreground">
              {dayHeader(anchor)}
            </p>
            <div className="flex flex-col gap-2.5">
              {sorted.map((ap) => (
                <ApptCard
                  key={ap.id}
                  appt={ap}
                  onSelect={onSelectAppointment}
                />
              ))}
            </div>
          </>
        )
      ) : weekGroups.length === 0 ? (
        <ListEmpty onNew={onNew} plural />
      ) : (
        <div className="flex flex-col gap-4">
          {weekGroups.map((g) => (
            <div key={g.dayIso}>
              <p className="mb-2 px-1 text-xs font-bold text-muted-foreground">
                {dayHeader(g.dayIso)}
              </p>
              <div className="flex flex-col gap-2.5">
                {g.items.map((ap) => (
                  <ApptCard
                    key={ap.id}
                    appt={ap}
                    onSelect={onSelectAppointment}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Estado vazio compacto (não ocupa meia tela — §5.4). */
function ListEmpty({ onNew, plural }: { onNew: () => void; plural?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <CalendarDays
        className="size-10 text-muted-foreground/40"
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">
        Nenhum agendamento {plural ? "nesta semana" : "neste dia"}
      </p>
      <button
        type="button"
        onClick={onNew}
        className="text-sm font-semibold text-primary"
      >
        + Novo agendamento
      </button>
    </div>
  );
}
