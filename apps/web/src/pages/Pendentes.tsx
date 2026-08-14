import { useCallback, useEffect, useState } from "react";
import { Inbox, Link2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { authedRequest } from "../lib/session";
import { PageLayout } from "../components/PageLayout";
import { EmptyState } from "../components/EmptyState";
import { ErrorState, errorKindFrom, type ErrorKind } from "../components/ErrorState";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { usePendentes } from "../lib/usePendentes";
import { useAuth } from "../auth/AuthContext";
import { canManageAllAppointments } from "../lib/permissions";
import { bumpAppointments } from "../lib/appointmentsSignal";


/** Pendente cru da API (`GET /appointments/pending`) — mesma view da agenda. */
interface PendingAppointment {
  id: string;
  clientName: string;
  serviceId: string;
  serviceName: string;
  professionalId: string | null;
  professionalName: string | null;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  status: string;
  source: "whatsapp" | "manual" | "app" | "link";
}

interface Attender {
  id: string;
  name: string;
}

/**
 * Pendentes no painel (Story 5B.3). Lista as solicitações `pending` — o link
 * público gera agendamentos que caem aqui para o dono/gerente CONFIRMAR (vira o
 * badge "Confirmado" da 3.7, profissional opcional) ou RECUSAR (com motivo, o
 * Refino DL-062 (2026-08-14): TODO autenticado acessa; o backend ESCOPA (o
 * profissional vê só os SEUS pendentes). Confirmar/Recusar seguem sendo de quem
 * gerencia a agenda de toda a equipe — para os demais a tela é somente leitura.
 */
export function Pendentes() {
  const { user } = useAuth();
  const managesAll = canManageAllAppointments(user);
  const { refresh: refreshCount } = usePendentes();
  const [items, setItems] = useState<PendingAppointment[]>([]);
  const [attenders, setAttenders] = useState<Attender[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  // Profissional escolhido (opcional) por pendente, antes de confirmar.
  const [chosen, setChosen] = useState<Record<string, string>>({});
  // Evita duplo-clique enquanto a ação de uma linha está em voo.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Recusa (reusa o padrão da 3.4): modal com motivo OBRIGATÓRIO.
  const [rejecting, setRejecting] = useState<PendingAppointment | null>(null);
  const [reason, setReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    try {
      const [pend, att] = await Promise.all([
        authedRequest("/appointments/pending", {}),
        authedRequest("/users/attenders", {}),
      ]);
      if (!pend.ok) {
        setErrorKind("server");
        setItems([]);
        return;
      }
      setItems(((await pend.json()) as { appointments: PendingAppointment[] }).appointments);
      if (att.ok) {
        setAttenders(((await att.json()) as { users: Attender[] }).users);
      }
    } catch (e) {
      setErrorKind(errorKindFrom(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = useCallback(
    async (item: PendingAppointment) => {
      if (busyId) return;
      setBusyId(item.id);
      try {
        const professionalId = chosen[item.id] || undefined;
        const res = await authedRequest(`/appointments/${item.id}/confirm`, {
          method: "PATCH",
          body: professionalId ? { professionalId } : {} ,
        });
        if (!res.ok) {
          toast.error(await apiMessage(res, "Não foi possível confirmar."));
          return;
        }
        setItems((prev) => prev.filter((a) => a.id !== item.id));
        refreshCount();
        // Confirmar cria um agendamento na agenda → sinaliza a recarga dela.
        bumpAppointments();
        toast.success("Agendamento confirmado.");
      } catch {
        toast.error("Não foi possível confirmar. Verifique sua conexão.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, chosen, refreshCount],
  );

  const reject = useCallback(async () => {
    if (!rejecting) return;
    const trimmed = reason.trim();
    if (trimmed === "") {
      setRejectError("O motivo é obrigatório.");
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      const res = await authedRequest(`/appointments/${rejecting.id}/reject`, {
        method: "PATCH",
        body: { reason: trimmed } ,
      });
      if (!res.ok) {
        setRejectError(await apiMessage(res, "Não foi possível recusar."));
        return;
      }
      const id = rejecting.id;
      setItems((prev) => prev.filter((a) => a.id !== id));
      refreshCount();
      // §5: recusar também é mutação de agendamento → a agenda recarrega junto
      // (o calendário e a lista deixam de mostrar o pendente recusado).
      bumpAppointments();
      closeReject();
      toast.success("Agendamento recusado.");
    } catch {
      setRejectError("Não foi possível recusar. Verifique sua conexão.");
    } finally {
      setRejectSubmitting(false);
    }
  }, [rejecting, reason, refreshCount]);

  const closeReject = useCallback(() => {
    setRejecting(null);
    setReason("");
    setRejectError(null);
    setRejectSubmitting(false);
  }, []);

  return (
    <PageLayout title="Pendentes">
      {loading ? (
        <ListRowsSkeleton />
      ) : errorKind ? (
        <ErrorState kind={errorKind} resource="os pendentes" onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          compact
          title="Nenhuma solicitação pendente"
          description="As solicitações feitas pelo link de agendamento aparecem aqui para você confirmar ou recusar."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm font-semibold text-foreground">
                  {item.clientName}
                </strong>
                <SourceHint source={item.source} />
              </div>
              <dl className="flex flex-col gap-1.5 text-sm">
                <Row label="Serviço" value={item.serviceName} />
                <Row
                  label="Horário"
                  value={`${item.date.split("-").reverse().join("/")} · ${item.start}–${item.end}`}
                />
              </dl>
              {/* Ações só para quem gerencia a agenda de toda a equipe (DL-062).
                  O profissional vê os seus pendentes em SOMENTE LEITURA. */}
              {managesAll && (
                <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end sm:justify-between">
                  <label className="flex flex-col gap-1.5 text-sm sm:max-w-56">
                    <span className="font-medium text-foreground">
                      Profissional (opcional)
                    </span>
                    <select
                      aria-label="Profissional"
                      value={chosen[item.id] ?? ""}
                      onChange={(e) =>
                        setChosen((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Sem preferência</option>
                      {attenders.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={busyId === item.id}
                      onClick={() => setRejecting(item)}
                    >
                      Recusar
                    </Button>
                    <Button
                      disabled={busyId === item.id}
                      onClick={() => void confirm(item)}
                    >
                      Confirmar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Recusar (Story 5B.3/FR-B4) — motivo OBRIGATÓRIO (padrão da 3.4). */}
      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && closeReject()}>
        <DialogContent>
          {rejecting && (
            <>
              <DialogHeader>
                <DialogTitle>Recusar solicitação</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">
                  Recusar a solicitação de{" "}
                  <strong className="text-foreground">{rejecting.clientName}</strong>{" "}
                  ({rejecting.serviceName} · {rejecting.start}–{rejecting.end}). O
                  motivo é enviado para avisar a cliente e a ação não pode ser
                  desfeita.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-foreground">Motivo</span>
                  <textarea
                    aria-label="Motivo da recusa"
                    rows={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ex.: não há horário disponível nesse dia"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
                {rejectError && (
                  <p role="alert" className="text-sm text-destructive">
                    {rejectError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={closeReject}
                    disabled={rejectSubmitting}
                  >
                    Voltar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void reject()}
                    disabled={rejectSubmitting}
                  >
                    {rejectSubmitting ? "Recusando…" : "Confirmar recusa"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

/** Origem da solicitação: link (público) e WhatsApp ganham dica; manual/app não. */
function SourceHint({ source }: { source: PendingAppointment["source"] }) {
  if (source === "link") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Link2 className="size-3.5" aria-hidden="true" />
        Pelo link
      </span>
    );
  }
  if (source === "whatsapp") {
    return (
      <MessageCircle
        className="size-4 shrink-0 text-muted-foreground"
        aria-label="WhatsApp"
      />
    );
  }
  return null;
}

/** Mensagem real da API (Nest: `{ message }`), com fallback. */
async function apiMessage(res: Response, fallback: string): Promise<string> {
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

/** Esqueleto de carregamento (Story 7.3 §2) — cards no formato dos pendentes. */
function ListRowsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  );
}
