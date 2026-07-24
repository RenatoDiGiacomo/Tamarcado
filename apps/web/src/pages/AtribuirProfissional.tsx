import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "../lib/api";
import { Button } from "../components/ui/button";
import { cn } from "@/lib/utils";

const ACCESS_KEY = "tamarcado.access";
const token = (): string | null => localStorage.getItem(ACCESS_KEY);

interface Attender {
  id: string;
  name: string;
}

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

/** Mensagem real da API (Nest: `{ message }`) — não esconde a causa (3.3.1). */
async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const m = body?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo JSON */
  }
  return fallback;
}

/**
 * Campo "Profissional" editável do detalhe (Story 3.5/DL-043). Muta só o
 * profissional via `PATCH /appointments/:id/professional`. `mode="any"`
 * (owner/gerente) mostra um select agrupando quem executa o serviço (AC4) e
 * avisa antes de aplicar se o horário estiver ocupado (AC3/D1). `mode="self"`
 * (basic num agendamento sem profissional) é um botão direto "Atribuir a mim" (D5).
 * Quem não pode editar nem renderiza este componente — cai na linha read-only.
 */
export function AtribuirProfissional({
  appointmentId,
  serviceId,
  date,
  start,
  currentProfessionalId,
  currentProfessionalName,
  mode,
  selfId,
  onAssigned,
}: {
  appointmentId: string;
  serviceId: string;
  date: string;
  start: string;
  currentProfessionalId: string | null;
  currentProfessionalName: string | null;
  mode: "any" | "self";
  selfId: string;
  onAssigned: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentProfessionalId ?? "");
  const [attenders, setAttenders] = useState<Attender[]>([]);
  const [serviceProfIds, setServiceProfIds] = useState<Set<string>>(new Set());
  const [slotTimes, setSlotTimes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Atendentes + quem executa o serviço (destaque, AC4) — só quando abre a edição.
  useEffect(() => {
    if (!editing) return;
    void (async () => {
      const [attRes, spRes] = await Promise.all([
        apiRequest("/users/attenders", { token: token() }),
        apiRequest(`/services/${serviceId}/professionals`, { token: token() }),
      ]);
      if (attRes.ok) {
        setAttenders(((await attRes.json()) as { users: Attender[] }).users);
      }
      if (spRes.ok) {
        setServiceProfIds(
          new Set(
            ((await spRes.json()) as { professionalIds: string[] }).professionalIds,
          ),
        );
      }
    })();
  }, [editing, serviceId]);

  // Conflito informativo (AC3): o horário do agendamento está livre para o NOVO
  // profissional? Reusa /availability (mesmo padrão da 3.3). Sem troca = sem busca.
  useEffect(() => {
    if (!editing || value === "" || value === currentProfessionalId) {
      setSlotTimes([]);
      return;
    }
    void (async () => {
      const q = new URLSearchParams({ serviceId, date, professionalId: value });
      const res = await apiRequest(`/availability?${q.toString()}`, {
        token: token(),
      });
      if (res.ok) {
        const data = (await res.json()) as { slots: { time: string }[] };
        setSlotTimes(data.slots.map((s) => s.time));
      } else {
        setSlotTimes([]);
      }
    })();
  }, [editing, value, serviceId, date, currentProfessionalId]);

  const changed = value !== (currentProfessionalId ?? "");
  const freeTimes = useMemo(() => new Set(slotTimes), [slotTimes]);
  // Dentro da janela de trabalho do profissional (entre 1º e último slot) mas
  // sem o horário livre → ele já está OCUPADO ali. Fora da janela é encaixe: sem
  // conflito com outro atendimento (não avisa — mesma lógica do Novo agendamento).
  const withinWindow =
    slotTimes.length > 0 &&
    start >= slotTimes[0] &&
    start <= slotTimes[slotTimes.length - 1];
  const overbook =
    value !== "" &&
    value !== currentProfessionalId &&
    slotTimes.length > 0 &&
    !freeTimes.has(start) &&
    withinWindow;
  const targetName = attenders.find((a) => a.id === value)?.name ?? "";

  const executa = attenders.filter((a) => serviceProfIds.has(a.id));
  const outros = attenders.filter((a) => !serviceProfIds.has(a.id));

  const doPatch = useCallback(
    async (target: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await apiRequest(
          `/appointments/${appointmentId}/professional`,
          {
            method: "PATCH",
            body: { professionalId: target === "" ? null : target },
            token: token(),
          },
        );
        if (!res.ok) {
          setError(
            await apiErrorMessage(res, "Não foi possível atribuir o profissional."),
          );
          return;
        }
        toast.success("Profissional atualizado.");
        setEditing(false);
        onAssigned();
      } catch {
        setError("Não foi possível atribuir. Verifique sua conexão.");
      } finally {
        setSubmitting(false);
      }
    },
    [appointmentId, onAssigned],
  );

  // Basic num agendamento sem profissional: atalho direto (só pode a si — D5).
  if (mode === "self") {
    return (
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">Profissional</dt>
        <dd className="flex items-center gap-2">
          <span className="italic text-muted-foreground">Não atribuído</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={submitting}
            onClick={() => void doPatch(selfId)}
          >
            {submitting ? "Atribuindo…" : "Atribuir a mim"}
          </Button>
        </dd>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">Profissional</dt>
        <dd className="flex items-center gap-2">
          <span
            className={
              currentProfessionalName
                ? "text-foreground"
                : "italic text-muted-foreground"
            }
          >
            {currentProfessionalName ?? "Não atribuído"}
          </span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => {
              setValue(currentProfessionalId ?? "");
              setError(null);
              setEditing(true);
            }}
          >
            {currentProfessionalName ? "trocar" : "atribuir"}
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <dt className="text-muted-foreground">Profissional</dt>
      <select
        aria-label="Profissional"
        className={selectCls}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">Não atribuído</option>
        {executa.length > 0 && (
          <optgroup label="Executa este serviço">
            {executa.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
        {outros.length > 0 && (
          <optgroup label="Outros">
            {outros.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {overbook && (
        <p role="alert" className="text-sm text-status-noshow">
          {targetName} já tem atendimento neste horário — atribuir mesmo assim?
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={submitting}
          onClick={() => {
            setEditing(false);
            setValue(currentProfessionalId ?? "");
            setError(null);
          }}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={submitting || !changed}
          className={cn(overbook && "bg-status-noshow hover:bg-status-noshow/90")}
          onClick={() => void doPatch(value)}
        >
          {submitting ? "Salvando…" : overbook ? "Atribuir mesmo assim" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
