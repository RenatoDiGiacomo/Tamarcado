import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildWeek,
  hasSchedule,
  toPutBody,
  validateWeek,
  DAY_LABELS,
  type ApiDay,
  type DayRow,
} from "./horarios.util";

const ACCESS_KEY = "tamarcado.access";
const token = (): string | null => localStorage.getItem(ACCESS_KEY);

interface Attender {
  id: string;
  name: string;
}
interface ScheduleResponse {
  intervalMinutes: number;
  days: ApiDay[];
}
type SaveStatus = "idle" | "saving" | "saved" | "error";

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

const onlyDigits = (v: string): string => v.replace(/\D/g, "");

/** Interruptor liga/desliga (switch). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string | string[] };
    const m = b?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo */
  }
  return fallback;
}

/**
 * Configurações → Horários (Story 3.3.2, owner-only). Por profissional: dias da
 * semana ativos + faixa início/fim + intervalo (0–120, DL-032). Salva a semana
 * inteira num PUT (substitui tudo). Reutiliza a API de schedules (1.6).
 */
export function ConfiguracoesHorarios() {
  const [attenders, setAttenders] = useState<Attender[]>([]);
  const [scheduled, setScheduled] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState("");
  const [week, setWeek] = useState<DayRow[]>(buildWeek([]));
  const [interval, setIntervalMin] = useState("0");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  // "Aplicar a todos os dias": um horário-modelo replicado aos dias ATIVOS.
  const [bulkStart, setBulkStart] = useState("09:00");
  const [bulkEnd, setBulkEnd] = useState("18:00");

  const getSchedule = useCallback(
    async (profId: string): Promise<ScheduleResponse | null> => {
      const res = await apiRequest(`/schedules/${profId}`, { token: token() });
      if (!res.ok) return null;
      return (await res.json()) as ScheduleResponse;
    },
    [],
  );

  /** Carrega a grade de um profissional para o editor. */
  const loadProf = useCallback(
    async (profId: string): Promise<void> => {
      setSelected(profId);
      setStatus("idle");
      setValidationError(null);
      const data = await getSchedule(profId);
      setWeek(buildWeek(data?.days ?? []));
      setIntervalMin(String(data?.intervalMinutes ?? 0));
    },
    [getSchedule],
  );

  // Carrega atendentes + quem tem horários (para o selo "sem horários").
  useEffect(() => {
    void (async () => {
      const res = await apiRequest("/users/attenders", { token: token() });
      if (!res.ok) return;
      const list = ((await res.json()) as { users: Attender[] }).users;
      setAttenders(list);
      const entries = await Promise.all(
        list.map(async (a) => {
          const data = await getSchedule(a.id);
          return [a.id, hasSchedule(data?.days ?? [])] as const;
        }),
      );
      setScheduled(Object.fromEntries(entries));
      if (list.length > 0) await loadProf(list[0].id);
    })();
  }, [getSchedule, loadProf]);

  function setDay(i: number, patch: Partial<DayRow>): void {
    setWeek((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    setStatus("idle");
  }

  /** Copia o horário-modelo para TODOS os dias ativos (configura uma vez). */
  function applyToAllDays(): void {
    setWeek((prev) =>
      prev.map((d) => (d.active ? { ...d, start: bulkStart, end: bulkEnd } : d)),
    );
    setStatus("idle");
  }

  /** Grava a grade atual para um profissional. Devolve a mensagem de erro ou null. */
  async function putFor(profId: string): Promise<string | null> {
    const res = await apiRequest(`/schedules/${profId}`, {
      method: "PUT",
      body: toPutBody(week, Number(interval || "0")),
      token: token(),
    });
    return res.ok ? null : apiError(res, "Não foi possível salvar os horários.");
  }

  async function refreshScheduledFlag(profIds: string[]): Promise<void> {
    const entries = await Promise.all(
      profIds.map(async (id) => {
        const data = await getSchedule(id);
        return [id, hasSchedule(data?.days ?? [])] as const;
      }),
    );
    setScheduled((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  }

  async function save(): Promise<void> {
    const err = validateWeek(week);
    if (err) {
      setValidationError(err);
      setStatus("idle");
      return;
    }
    setValidationError(null);
    setStatus("saving");
    const msg = await putFor(selected);
    if (msg) {
      setErrorMsg(msg);
      setStatus("error");
      return;
    }
    await refreshScheduledFlag([selected]);
    setStatus("saved");
  }

  async function applyToAll(): Promise<void> {
    setConfirmAll(false);
    const err = validateWeek(week);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setStatus("saving");
    for (const a of attenders) {
      const msg = await putFor(a.id);
      if (msg) {
        setErrorMsg(msg);
        setStatus("error");
        return;
      }
    }
    await refreshScheduledFlag(attenders.map((a) => a.id));
    setStatus("saved");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Seletor de profissional (com selo "sem horários" — AC7) */}
      <div className="flex w-full flex-col gap-2 sm:max-w-sm">
        <Label htmlFor="prof">Profissional</Label>
        <select
          id="prof"
          className={inputCls}
          value={selected}
          onChange={(e) => void loadProf(e.target.value)}
        >
          {attenders.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {scheduled[a.id] === false ? " · sem horários" : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <Card className="w-full sm:max-w-lg">
          <CardContent className="flex flex-col gap-5 p-4 sm:p-6">
            {/* Aplicar a todos os dias — configura o horário UMA vez e replica
                para todos os dias ativos (quem atende 6 dias no mesmo horário). */}
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <span className="text-sm font-medium text-foreground">
                Aplicar a todos os dias
              </span>
              <div className="flex items-end gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Início
                  <Input
                    type="time"
                    aria-label="Início (todos os dias)"
                    value={bulkStart}
                    onChange={(e) => setBulkStart(e.target.value)}
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Término
                  <Input
                    type="time"
                    aria-label="Término (todos os dias)"
                    value={bulkEnd}
                    onChange={(e) => setBulkEnd(e.target.value)}
                  />
                </label>
                <Button type="button" variant="secondary" onClick={applyToAllDays}>
                  Aplicar
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                Replica o horário acima para todos os dias ativos.
              </span>
            </div>

            {/* Um card por dia da semana: nome + toggle; ao ligar, expande
                Início/Término lado a lado (input nativo de hora). */}
            <div className="flex flex-col gap-2">
              {week.map((d, i) => (
                <div
                  key={d.dayOfWeek}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "font-medium",
                        d.active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {DAY_LABELS[i]}
                    </span>
                    <Toggle
                      checked={d.active}
                      onChange={(v) => setDay(i, { active: v })}
                      label={DAY_LABELS[i]}
                    />
                  </div>
                  {d.active && (
                    <div className="mt-3 flex gap-3">
                      <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                        Início
                        <Input
                          type="time"
                          aria-label={`Início ${DAY_LABELS[i]}`}
                          value={d.start}
                          onChange={(e) => setDay(i, { start: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                        Término
                        <Input
                          type="time"
                          aria-label={`Fim ${DAY_LABELS[i]}`}
                          value={d.end}
                          onChange={(e) => setDay(i, { end: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Intervalo entre atendimentos (DL-032) */}
            <div className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="interval">Intervalo entre atendimentos (min)</Label>
              <Input
                id="interval"
                inputMode="numeric"
                value={interval}
                onChange={(e) => {
                  const n = Math.min(Number(onlyDigits(e.target.value) || "0"), 120);
                  setIntervalMin(String(n));
                  setStatus("idle");
                }}
              />
              <span className="text-xs text-muted-foreground">
                0 a 120 minutos entre um atendimento e o próximo.
              </span>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
              <Button type="button" onClick={() => void save()} disabled={status === "saving"}>
                Salvar
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmAll(true)}
                disabled={status === "saving" || attenders.length < 2}
              >
                Aplicar a todos
              </Button>
              {validationError && (
                <p role="alert" className="text-sm text-destructive">
                  {validationError}
                </p>
              )}
              {!validationError && status === "saved" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Horários salvos.
                </p>
              )}
              {!validationError && status === "error" && (
                <p role="alert" className="text-sm text-destructive">
                  {errorMsg}
                </p>
              )}
            </div>

            {confirmAll && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-4">
                <p className="text-sm text-foreground">
                  Aplicar este horário aos {attenders.length} profissionais? Substitui os horários
                  atuais de todos.
                </p>
                <Button type="button" size="sm" onClick={() => void applyToAll()}>
                  Confirmar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmAll(false)}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
