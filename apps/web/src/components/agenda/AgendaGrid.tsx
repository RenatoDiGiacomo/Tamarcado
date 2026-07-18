import { useState, type ReactNode } from "react";
import { MessageCircle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusChip, type AppointmentStatus } from "../StatusChip";
import { packColumns } from "./layout";

export type AgendaView = "dia" | "semana";
export type OriginFilter = "todos" | "whatsapp" | "manual";

/**
 * Agendamento exibido na grade. Casca pura (DL-036): a Story 3.2 preenche com
 * dados reais; aqui não há fetch nem regra de negócio.
 */
export interface AgendaAppointment {
  id: string;
  clientName: string;
  serviceName: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  status: AppointmentStatus;
  origin: "whatsapp" | "manual";
  professionalName: string | null;
  weekday?: number; // 0=Seg .. 6=Dom (usado na visão semana)
}

export interface AgendaGridProps {
  dateLabel: string; // ex.: "Ter, 17/06"
  businessHours: { start: string; end: string };
  appointments: AgendaAppointment[];
  defaultView?: AgendaView;
  /** Visão controlada (Story 3.2/D6): a tela busca 1 dia × 7 dias. Se omitido, a casca controla internamente (demo). */
  view?: AgendaView;
  onViewChange?: (view: AgendaView) => void;
  /** Conteúdo mostrado no corpo quando não há agendamentos (AC6). Se omitido, mostra a grade vazia. */
  emptyState?: ReactNode;
  onSelect?: (id: string) => void;
  onNew?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

const HOUR_PX = 56;
/** Largura fixa da coluna da badge de status (dia / semana). Badge centralizada
 *  nela → status de larguras diferentes alinham entre si. Semana é mais estreita
 *  para caber na trilha do dia. */
const CHIP_COL = "w-[140px]";
/** Altura mínima do card — garante que 1 linha (ex.: serviço de 15min) não corte. */
const MIN_BLOCK_H = 34;
/** Respiro acima do primeiro horário, para o 1º agendamento não colar no topo. */
const GRID_PAD_TOP = 12;
/** Altura máxima do corpo rolável; o cabeçalho (controles) fica fixo acima. */
const BODY_MAX_H = "max-h-[70vh]";
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const BORDER: Record<AppointmentStatus, string> = {
  pending: "border-l-status-pending",
  confirmed: "border-l-status-confirmed",
  done: "border-l-status-done",
  cancelled: "border-l-status-cancelled",
  noshow: "border-l-status-noshow",
};
const TINT: Record<AppointmentStatus, string> = {
  pending: "bg-status-pending/10",
  confirmed: "bg-status-confirmed/10",
  done: "bg-status-done/10",
  cancelled: "bg-status-cancelled/10",
  noshow: "bg-status-noshow/10",
};

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function OriginIcon({ origin }: { origin: "whatsapp" | "manual" }) {
  return origin === "manual" ? (
    <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-label="Manual" />
  ) : (
    <MessageCircle
      className="size-3.5 shrink-0 text-muted-foreground"
      aria-label="WhatsApp"
    />
  );
}

function Block({
  appt,
  dayStartMin,
  offsetTop = 0,
  compact,
  col = 0,
  cols = 1,
  onSelect,
}: {
  appt: AgendaAppointment;
  dayStartMin: number;
  offsetTop?: number;
  compact?: boolean;
  /** Coluna/total de colunas quando há sobreposição (layout de colisão). */
  col?: number;
  cols?: number;
  onSelect?: (id: string) => void;
}) {
  const top =
    offsetTop + ((toMin(appt.start) - dayStartMin) / 60) * HOUR_PX;
  const durationMin = toMin(appt.end) - toMin(appt.start);
  // Proporcional à duração, com ALTURA MÍNIMA para nada cortar (serviço de 15min).
  const height = Math.max((durationMin / 60) * HOUR_PX, MIN_BLOCK_H);
  // Colisão (D1/overbooking): cards sobrepostos dividem a largura em colunas
  // lado a lado (padrão Google Calendar). Sem sobreposição → largura total.
  const wPct = 100 / cols;
  const left = `calc(${col * wPct}% + 2px)`;
  const width = `calc(${wPct}% - 4px)`;
  // Layout adaptativo por duração (visão Dia): ≥60min → 3 linhas; 30–59 → 2; <30 → 1.
  const showService = durationMin >= 30;
  const showProfessional = durationMin >= 60;

  const clientLine = (
    <div className="flex items-center gap-1.5">
      <OriginIcon origin={appt.origin} />
      <span
        className={cn(
          "truncate text-xs font-semibold text-foreground",
          appt.status === "cancelled" && "line-through",
        )}
      >
        {appt.clientName}
        {/* <30min (Dia): horário na própria linha do nome (layout de 1 linha). */}
        {!compact && !showService && (
          <span className="font-normal text-muted-foreground"> · {appt.start}</span>
        )}
      </span>
    </div>
  );

  // Semana: a trilha do dia é estreita (ainda mais com colisão). O status é
  // comunicado APENAS pela cor do card (borda + fundo); nada de badge, que
  // roubaria o espaço do nome. Só o nome do cliente (trunca).
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(appt.id)}
        style={{ top, height, left, width }}
        className={cn(
          "absolute flex flex-col justify-center overflow-hidden rounded-md border-l-4 px-2 py-1 text-left",
          BORDER[appt.status],
          TINT[appt.status],
        )}
      >
        {clientLine}
      </button>
    );
  }

  // Dia: coluna de texto adaptativa (esquerda) + badge numa COLUNA DE LARGURA FIXA
  // à direita, centralizada nela (H) e no card (V) — status de larguras diferentes
  // ("Confirmado", "Não compareceu") ficam alinhados entre si, não só a borda direita.
  return (
    <button
      type="button"
      onClick={() => onSelect?.(appt.id)}
      style={{ top, height, left, width }}
      className={cn(
        "absolute flex items-stretch overflow-hidden rounded-md border-l-4 py-1 pl-2 pr-1 text-left",
        BORDER[appt.status],
        TINT[appt.status],
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        {clientLine}
        {showService && (
          <span className="truncate text-[11px] text-muted-foreground">
            {appt.serviceName} · {appt.start}–{appt.end}
          </span>
        )}
        {showProfessional && (
          <span
            className={cn(
              "truncate text-[11px]",
              appt.professionalName
                ? "text-muted-foreground"
                : "italic text-muted-foreground/70",
            )}
          >
            {appt.professionalName ?? "Não atribuído"}
          </span>
        )}
      </div>

      <div className={cn("flex shrink-0 items-center justify-center", CHIP_COL)}>
        <StatusChip status={appt.status} />
      </div>
    </button>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 text-sm font-semibold transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Casca da grade de agenda (Story 2.1, DL-036) — dia e semana. Pura apresentação. */
export function AgendaGrid({
  dateLabel,
  businessHours,
  appointments,
  defaultView = "dia",
  view: controlledView,
  onViewChange,
  emptyState,
  onSelect,
  onNew,
  onPrev,
  onNext,
}: AgendaGridProps) {
  // Visão controlada (D6) tem precedência; senão a casca gerencia internamente.
  const [internalView, setInternalView] = useState<AgendaView>(defaultView);
  const view = controlledView ?? internalView;
  const setView = (v: AgendaView): void => {
    onViewChange?.(v);
    if (controlledView === undefined) setInternalView(v);
  };
  const [filter, setFilter] = useState<OriginFilter>("todos");

  const dayStartMin = Math.floor(toMin(businessHours.start) / 60) * 60;
  const dayEndMin = Math.ceil(toMin(businessHours.end) / 60) * 60;
  const rows = Math.max((dayEndMin - dayStartMin) / 60, 1);
  const gridHeight = rows * HOUR_PX;

  const shown = appointments.filter(
    (a) => filter === "todos" || a.origin === filter,
  );

  const hourLabels = Array.from({ length: rows + 1 }, (_, i) => {
    const h = dayStartMin / 60 + i;
    return `${String(h).padStart(2, "0")}:00`;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-base font-semibold text-foreground">
            <button
              type="button"
              aria-label="Anterior"
              onClick={onPrev}
              className="rounded px-1 text-muted-foreground hover:bg-accent"
            >
              ‹
            </button>
            <span>{dateLabel}</span>
            <button
              type="button"
              aria-label="Próximo"
              onClick={onNext}
              className="rounded px-1 text-muted-foreground hover:bg-accent"
            >
              ›
            </button>
          </div>
          <Segmented
            options={[
              { value: "dia", label: "Dia" },
              { value: "semana", label: "Semana" },
            ]}
            value={view}
            onChange={setView}
          />
          <button
            type="button"
            disabled
            title="Em breve"
            className="cursor-not-allowed text-xs text-muted-foreground/70"
          >
            Mês — em breve
          </button>
        </div>
        <Segmented
          options={[
            { value: "todos", label: "Todos" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "manual", label: "Manual" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {/* Grade — corpo rolável (o cabeçalho de controles acima fica fixo) */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className={cn(BODY_MAX_H, "overflow-y-auto")}>
          {emptyState && shown.length === 0 ? (
            <div className="p-6">{emptyState}</div>
          ) : view === "dia" ? (
            <div className="flex">
              <div
                className="w-14 shrink-0 bg-muted/40"
                style={{ height: gridHeight + GRID_PAD_TOP, paddingTop: GRID_PAD_TOP }}
              >
                {hourLabels.map((label, i) => (
                  <div
                    key={label}
                    className="px-2 text-[11px] text-muted-foreground"
                    style={{ height: i < rows ? HOUR_PX : 0 }}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div
                className="relative flex-1"
                style={{ height: gridHeight + GRID_PAD_TOP }}
              >
                {Array.from({ length: rows + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: GRID_PAD_TOP + i * HOUR_PX }}
                  />
                ))}
                {packColumns(shown).map((p) => (
                  <Block
                    key={p.item.id}
                    appt={p.item}
                    dayStartMin={dayStartMin}
                    offsetTop={GRID_PAD_TOP}
                    col={p.col}
                    cols={p.cols}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex">
              <div
                className="w-14 shrink-0"
                style={{ height: gridHeight + GRID_PAD_TOP + 28 }}
              >
                {/* Faixa que acompanha o cabeçalho de dias (sticky) */}
                <div className="sticky top-0 z-20 h-7 bg-card" />
                <div
                  className="bg-muted/40"
                  style={{ height: gridHeight + GRID_PAD_TOP, paddingTop: GRID_PAD_TOP }}
                >
                  {hourLabels.map((label, i) => (
                    <div
                      key={label}
                      className="px-2 text-[11px] text-muted-foreground"
                      style={{ height: i < rows ? HOUR_PX : 0 }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-1">
                {WEEKDAYS.map((wd, dayIdx) => (
                  <div key={wd} className="flex-1 border-l border-border/60">
                    <div className="sticky top-0 z-20 h-7 border-b border-border/60 bg-card text-center text-xs font-semibold text-muted-foreground">
                      {wd}
                    </div>
                    <div
                      className="relative"
                      style={{ height: gridHeight + GRID_PAD_TOP }}
                    >
                      {Array.from({ length: rows + 1 }, (_, i) => (
                        <div
                          key={i}
                          className="absolute inset-x-0 border-t border-border/40"
                          style={{ top: GRID_PAD_TOP + i * HOUR_PX }}
                        />
                      ))}
                      {packColumns(
                        shown.filter((a) => a.weekday === dayIdx),
                      ).map((p) => (
                        <Block
                          key={p.item.id}
                          appt={p.item}
                          dayStartMin={dayStartMin}
                          offsetTop={GRID_PAD_TOP}
                          compact
                          col={p.col}
                          cols={p.cols}
                          onSelect={onSelect}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      {onNew && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNew}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            + Novo agendamento
          </button>
        </div>
      )}
    </div>
  );
}
