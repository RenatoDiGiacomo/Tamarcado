import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import { EmptyState } from "../components/EmptyState";
import { StatusChip } from "../components/StatusChip";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  AgendaGrid,
  type AgendaView,
} from "../components/agenda/AgendaGrid";
import { NovoAgendamento, type EditingAppointment } from "./NovoAgendamento";
import { useAuth } from "../auth/AuthContext";
import {
  formatDateLabel,
  periodRange,
  shiftAnchor,
  todayIso,
  toAgendaAppointment,
  type ApiAppointment,
} from "./agendaMap";

const ACCESS_KEY = "tamarcado.access";
const token = (): string | null => localStorage.getItem(ACCESS_KEY);

interface AgendaResponse {
  appointments: ApiAppointment[];
  businessHours: { start: string; end: string };
}

/**
 * Agenda do painel (Story 3.2). Consome `GET /appointments` do período atual e
 * alimenta a casca `AgendaGrid` (DL-036). A visão Dia/Semana é controlada aqui
 * (D6) para buscar 1 dia × 7 dias. Clicar num card abre um detalhe read-only (D3).
 */
export function Agenda() {
  const { user } = useAuth();
  const [anchor, setAnchor] = useState<string>(() => todayIso());
  const [view, setView] = useState<AgendaView>("dia");
  const [data, setData] = useState<AgendaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  // Edição (Story 3.6): reusa o formulário de Novo agendamento pré-preenchido.
  const [editing, setEditing] = useState<EditingAppointment | null>(null);
  // Bump para forçar recarga mesmo quando o período não muda (ex.: criar um
  // agendamento no dia já aberto — senão a agenda manteria a lista antiga).
  const [refreshKey, setRefreshKey] = useState(0);
  // Cancelamento (Story 3.4): o detalhe read-only vira confirmação destrutiva.
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { from, to } = periodRange(anchor, view);
    try {
      const res = await apiRequest(`/appointments?from=${from}&to=${to}`, {
        token: token(),
      });
      if (!res.ok) throw new Error("load");
      setData((await res.json()) as AgendaResponse);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [anchor, view, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const appointments = useMemo(
    () => (data?.appointments ?? []).map(toAgendaAppointment),
    [data],
  );
  // Faixa da grade = horário de funcionamento do salão, ESTENDIDO para cobrir
  // qualquer agendamento fora dele (encaixe às 20:15 com salão fechando 19:00
  // não pode ficar invisível). O funcionamento é configurável em Identidade.
  const businessHours = useMemo(() => {
    const base = data?.businessHours ?? { start: "08:00", end: "19:00" };
    let start = base.start;
    let end = base.end;
    for (const a of appointments) {
      if (a.start < start) start = a.start;
      if (a.end > end) end = a.end;
    }
    return { start, end };
  }, [data, appointments]);
  const selected = data?.appointments.find((a) => a.id === selectedId) ?? null;
  const isActiveStatus =
    selected?.status === "pending" || selected?.status === "confirmed";
  const canCancel = isActiveStatus;
  // Editar (Story 3.6/DL-044/D-B1): owner/gerente editam qualquer ativo; `basic`
  // edita o próprio OU assume um não atribuído (professional_id nulo, caso do bot).
  const canEdit =
    isActiveStatus &&
    (user?.accessLevel !== "basic" ||
      selected?.professionalId === user?.id ||
      selected?.professionalId === null);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setCancelMode(false);
    setCancelReason("");
    setCancelError(null);
    setCancelSubmitting(false);
  }, []);

  // Abre o Editar (3.6): captura os dados do agendamento e fecha o detalhe.
  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditing({
      appointmentId: selected.id,
      clientName: selected.clientName,
      serviceId: selected.serviceId,
      professionalId: selected.professionalId,
      date: selected.date,
      time: selected.start,
    });
    closeDetail();
  }, [selected, closeDetail]);

  const cancelAppointment = useCallback(async () => {
    if (!selectedId) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const reason = cancelReason.trim();
      const res = await apiRequest(`/appointments/${selectedId}/cancel`, {
        method: "PATCH",
        body: reason !== "" ? { reason } : {},
        token: token(),
      });
      if (!res.ok) {
        setCancelError(await cancelErrorMessage(res));
        return;
      }
      closeDetail();
      setRefreshKey((k) => k + 1); // recarrega: o card vira Cancelado, slot volta
      toast.success("Agendamento cancelado.");
    } catch {
      setCancelError("Não foi possível cancelar. Verifique sua conexão.");
    } finally {
      setCancelSubmitting(false);
    }
  }, [selectedId, cancelReason, closeDetail]);

  const emptyState = (
    <EmptyState
      icon={CalendarDays}
      title={view === "dia" ? "Nenhum agendamento neste dia" : "Nenhum agendamento nesta semana"}
      description="Os agendamentos deste período aparecem aqui. Use ‹ › para navegar ou crie um novo."
    />
  );

  return (
    <PageLayout title="Agenda">
      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Carregando agenda…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a agenda.
        </p>
      ) : (
        <AgendaGrid
          dateLabel={formatDateLabel(anchor, view)}
          businessHours={businessHours}
          appointments={appointments}
          view={view}
          onViewChange={setView}
          emptyState={emptyState}
          onPrev={() => setAnchor((a) => shiftAnchor(a, view, -1))}
          onNext={() => setAnchor((a) => shiftAnchor(a, view, 1))}
          onSelect={setSelectedId}
          onNew={() => setNovoOpen(true)}
        />
      )}

      {/* Novo agendamento manual (Story 3.3) — modal sobre a agenda (D4). */}
      <NovoAgendamento
        open={novoOpen}
        onOpenChange={setNovoOpen}
        date={anchor}
        onCreated={(created) => {
          setView("dia");
          setAnchor(created);
          // Recarrega sempre — mesmo criando no dia já aberto (anchor igual).
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Editar agendamento (Story 3.6) — mesmo formulário, pré-preenchido. */}
      <NovoAgendamento
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        date={anchor}
        editing={editing}
        onCreated={(saved) => {
          setView("dia");
          setAnchor(saved);
          setRefreshKey((k) => k + 1);
          setEditing(null);
        }}
      />

      {/* Detalhe read-only (D3) → confirmação de cancelamento (Story 3.4). */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && closeDetail()}
      >
        <DialogContent>
          {selected && !cancelMode && (
            <>
              <DialogHeader>
                {/* Título: nome + ícone de origem (só WhatsApp) + badge de status. */}
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{selected.clientName}</span>
                  {selected.source === "whatsapp" && (
                    <MessageCircle
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-label="WhatsApp"
                    />
                  )}
                  <StatusChip status={toAgendaAppointment(selected).status} />
                </DialogTitle>
              </DialogHeader>
              <dl className="flex flex-col gap-3 text-sm">
                <Row label="Serviço" value={selected.serviceName} />
                <Row
                  label="Horário"
                  value={`${selected.date.split("-").reverse().join("/")} · ${selected.start}–${selected.end}`}
                />
                <Row
                  label="Profissional"
                  value={selected.professionalName ?? "Não atribuído"}
                  muted={!selected.professionalName}
                />
              </dl>
              {(canEdit || canCancel) && (
                <div className="flex justify-end gap-2 pt-1">
                  {canEdit && (
                    <Button variant="secondary" onClick={openEdit}>
                      Editar
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="destructive"
                      onClick={() => setCancelMode(true)}
                    >
                      Cancelar agendamento
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {selected && cancelMode && (
            <>
              <DialogHeader>
                <DialogTitle>Cancelar agendamento</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">
                  Cancelar o atendimento de{" "}
                  <strong className="text-foreground">
                    {selected.clientName}
                  </strong>{" "}
                  ({selected.serviceName} · {selected.start}–{selected.end}). O
                  horário volta a ficar disponível e a ação não pode ser desfeita.
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-foreground">
                    Motivo (opcional)
                  </span>
                  <textarea
                    aria-label="Motivo do cancelamento"
                    rows={3}
                    maxLength={500}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Ex.: cliente pediu para remarcar"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </label>
                {cancelError && (
                  <p role="alert" className="text-sm text-destructive">
                    {cancelError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCancelMode(false);
                      setCancelError(null);
                    }}
                    disabled={cancelSubmitting}
                  >
                    Voltar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void cancelAppointment()}
                    disabled={cancelSubmitting}
                  >
                    {cancelSubmitting ? "Cancelando…" : "Confirmar cancelamento"}
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

/** Extrai a mensagem real da API (Nest: `{ message }`) — não esconde a causa. */
async function cancelErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const m = body?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo JSON */
  }
  return "Não foi possível cancelar o agendamento.";
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={muted ? "italic text-muted-foreground" : "text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
