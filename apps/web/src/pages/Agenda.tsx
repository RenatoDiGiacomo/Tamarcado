import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { apiRequest } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import { EmptyState } from "../components/EmptyState";
import { StatusChip } from "../components/StatusChip";
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
  const [anchor, setAnchor] = useState<string>(() => todayIso());
  const [view, setView] = useState<AgendaView>("dia");
  const [data, setData] = useState<AgendaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  }, [anchor, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const appointments = useMemo(
    () => (data?.appointments ?? []).map(toAgendaAppointment),
    [data],
  );
  const businessHours = data?.businessHours ?? { start: "08:00", end: "19:00" };
  const selected = data?.appointments.find((a) => a.id === selectedId) ?? null;

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
        />
      )}

      {/* Detalhe read-only (D3) — mutações vêm nas Stories 3.3/3.4. */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.clientName}</DialogTitle>
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
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusChip status={toAgendaAppointment(selected).status} />
                  </dd>
                </div>
                <Row
                  label="Origem"
                  value={selected.source === "whatsapp" ? "WhatsApp" : "Manual"}
                />
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
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
