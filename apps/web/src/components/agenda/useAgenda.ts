import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { authedRequest } from "../../lib/session";
import { errorKindFrom, type ErrorKind } from "../ErrorState";
import {
  bumpAppointments,
  useAppointmentsVersion,
} from "../../lib/appointmentsSignal";
import { useAuth } from "../../auth/AuthContext";
import { canManageAllAppointments, canViewModule } from "../../lib/permissions";
import { usePendentes } from "../../lib/usePendentes";
import {
  periodRange,
  shiftAnchor,
  todayIso,
  toAgendaAppointment,
  type ApiAppointment,
} from "../../pages/agendaMap";
import type { EditingAppointment } from "../../pages/NovoAgendamento";
import type { AppointmentStatus } from "../StatusChip";
import type { AgendaView } from "./AgendaGrid";


interface AgendaResponse {
  appointments: ApiAppointment[];
  businessHours: { start: string; end: string };
}

/**
 * TODA a regra de negócio da tela Agenda — busca de dados, período, permissões,
 * transições de status, cancelamento e tratamento de erro — vive AQUI, fora dos
 * componentes de apresentação. Assim `AgendaGrid` (desktop) e `AgendaList`
 * (mobile) são duas VISTAS da mesma lógica; bug de regra se corrige num lugar só
 * (regra estrutural do Épico 7 / painel-mobile §5.1).
 */
export function useAgenda() {
  const { user } = useAuth();
  const { refresh: refreshPending } = usePendentes();
  const [anchor, setAnchor] = useState<string>(() => todayIso());
  const [view, setView] = useState<AgendaView>("dia");
  const [data, setData] = useState<AgendaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [editing, setEditing] = useState<EditingAppointment | null>(null);
  // Sinal global de mutação (Story 7.3 §5): mutações daqui E de Pendentes
  // bumpam; a busca depende dele, então a lista e o mapa do mês recarregam.
  const version = useAppointmentsVersion();
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    const { from, to } = periodRange(anchor, view);
    try {
      const res = await authedRequest(`/appointments?from=${from}&to=${to}`, {
        });
      // 4xx/5xx = erro do SERVIDOR (respondeu, mas mal); rede/timeout cai no
      // catch como conexão. Mensagens distintas na tela (Story 7.3 §3).
      if (!res.ok) {
        setErrorKind("server");
        setData(null);
        return;
      }
      setData((await res.json()) as AgendaResponse);
    } catch (e) {
      setErrorKind(errorKindFrom(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [anchor, view, version]);

  useEffect(() => {
    void load();
  }, [load]);

  // FAB do celular (Épico 7 §4.2): navega para "/" com state.novo e abre o Novo
  // agendamento aqui. Limpa o history state para não reabrir ao voltar/recarregar.
  const location = useLocation();
  useEffect(() => {
    const state = location.state as { novo?: number } | null;
    if (state?.novo) {
      setNovoOpen(true);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const appointments = useMemo(
    () => (data?.appointments ?? []).map(toAgendaAppointment),
    [data],
  );
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
  const managesAll = canManageAllAppointments(user);
  const canEdit =
    isActiveStatus &&
    (managesAll ||
      selected?.professionalId === user?.id ||
      selected?.professionalId === null);
  const hasStarted = selected
    ? new Date(`${selected.date}T${selected.start}`).getTime() <= Date.now()
    : false;
  const canMark =
    selected?.status === "confirmed" &&
    hasStarted &&
    (managesAll || selected?.professionalId === user?.id);
  const canConfirm = selected?.status === "pending" && managesAll;
  // Financeiro (Story 5.2): quem tem o módulo vê/registra o pagamento no detalhe.
  const canViewFinanceiro = canViewModule(user, "financeiro");

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setCancelMode(false);
    setCancelReason("");
    setCancelError(null);
    setCancelSubmitting(false);
  }, []);

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

  const markStatus = useCallback(
    async (to: "completed" | "no_show") => {
      if (!selectedId || marking) return;
      setMarking(true);
      try {
        const res = await authedRequest(`/appointments/${selectedId}/status`, {
          method: "PATCH",
          body: { to } ,
        });
        if (!res.ok) {
          toast.error(await statusErrorMessage(res));
          return;
        }
        closeDetail();
        bumpAppointments();
        toast.success(
          to === "completed"
            ? "Atendimento concluído."
            : "Marcado como não compareceu.",
        );
      } catch {
        toast.error("Não foi possível marcar. Verifique sua conexão.");
      } finally {
        setMarking(false);
      }
    },
    [selectedId, marking, closeDetail],
  );

  const confirmAppointment = useCallback(async () => {
    if (!selectedId || confirming) return;
    setConfirming(true);
    try {
      const res = await authedRequest(`/appointments/${selectedId}/confirm`, {
        method: "PATCH",
        body: {} ,
      });
      if (!res.ok) {
        toast.error(await statusErrorMessage(res));
        return;
      }
      closeDetail();
      bumpAppointments();
      refreshPending();
      toast.success("Agendamento confirmado.");
    } catch {
      toast.error("Não foi possível confirmar. Verifique sua conexão.");
    } finally {
      setConfirming(false);
    }
  }, [selectedId, confirming, closeDetail, refreshPending]);

  const cancelAppointment = useCallback(async () => {
    if (!selectedId) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const reason = cancelReason.trim();
      const res = await authedRequest(`/appointments/${selectedId}/cancel`, {
        method: "PATCH",
        body: reason !== "" ? { reason } : {} ,
      });
      if (!res.ok) {
        setCancelError(await cancelErrorMessage(res));
        return;
      }
      closeDetail();
      bumpAppointments();
      toast.success("Agendamento cancelado.");
    } catch {
      setCancelError("Não foi possível cancelar. Verifique sua conexão.");
    } finally {
      setCancelSubmitting(false);
    }
  }, [selectedId, cancelReason, closeDetail]);

  const prev = useCallback(
    () => setAnchor((a) => shiftAnchor(a, view, -1)),
    [view],
  );
  const next = useCallback(
    () => setAnchor((a) => shiftAnchor(a, view, 1)),
    [view],
  );

  // Recarrega após criar/editar (mesmo no dia já aberto).
  const onSaved = useCallback((savedDate: string) => {
    setView("dia");
    setAnchor(savedDate);
    bumpAppointments();
  }, []);

  return {
    // dados/estado
    anchor,
    view,
    setView,
    appointments,
    businessHours,
    loading,
    hasData: data !== null,
    // Sinal de recarga: bumpa a CADA mutação bem-sucedida (criar/editar/
    // remarcar/cancelar/confirmar/marcar). A lista já refaz via `load`; o mapa
    // de status do mês (calendário) recebe isto para refazer junto — ver
    // useMonthAppointments(month, dataVersion).
    dataVersion: version,
    errorKind,
    // Tenta carregar de novo após um erro (Story 7.3 §3) — reusa o sinal.
    retry: bumpAppointments,
    // seleção + detalhe
    selected,
    setSelectedId,
    closeDetail,
    // permissões
    canCancel,
    canEdit,
    canMark,
    canConfirm,
    canViewFinanceiro,
    // ações
    openEdit,
    markStatus,
    confirmAppointment,
    cancelAppointment,
    confirming,
    marking,
    // cancelamento (form)
    cancelMode,
    setCancelMode,
    cancelReason,
    setCancelReason,
    cancelSubmitting,
    cancelError,
    setCancelError,
    // novo/editar
    novoOpen,
    setNovoOpen,
    editing,
    setEditing,
    onSaved,
    // navegação de período
    prev,
    next,
    setAnchor,
  };
}

// Prioridade do status "representativo" de um dia (quando há vários): o que
// pede mais atenção aparece primeiro — pendente (aguarda ação) > confirmado >
// concluído > não compareceu > cancelado. Define a COR do dia no calendário.
const STATUS_PRIORITY: Record<AppointmentStatus, number> = {
  pending: 1,
  confirmed: 2,
  done: 3,
  noshow: 4,
  cancelled: 5,
};

/**
 * Status representativo por DIA do mês — para colorir os dias/pontos do
 * calendário do `AgendaList` (mobile) conforme o status (não sempre o roxo).
 * Read-only, separado do fluxo do período. `month` = "YYYY-MM". Fica no módulo
 * compartilhado (não no componente) para manter a busca de dados fora da
 * apresentação.
 */
export function useMonthAppointments(
  month: string,
  /** Bumpa a cada mutação (useAgenda.dataVersion) → recarrega o mês na hora. */
  version = 0,
): Map<string, AppointmentStatus> {
  const [days, setDays] = useState<Map<string, AppointmentStatus>>(
    () => new Map(),
  );
  useEffect(() => {
    let alive = true;
    const from = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate(); // dia 0 do próximo mês = último deste
    const to = `${month}-${String(last).padStart(2, "0")}`;
    void (async () => {
      try {
        const res = await authedRequest(`/appointments?from=${from}&to=${to}`, {
          });
        if (!res.ok) return;
        const body = (await res.json()) as { appointments: ApiAppointment[] };
        if (!alive) return;
        const map = new Map<string, AppointmentStatus>();
        for (const a of body.appointments) {
          const st = toAgendaAppointment(a).status;
          const cur = map.get(a.date);
          if (cur === undefined || STATUS_PRIORITY[st] < STATUS_PRIORITY[cur]) {
            map.set(a.date, st);
          }
        }
        setDays(map);
      } catch {
        /* pontos são um extra; falha silenciosa não quebra a agenda */
      }
    })();
    return () => {
      alive = false;
    };
  }, [month, version]);
  return days;
}

/** Extrai a mensagem real da API (Nest: `{ message }`) — não esconde a causa. */
export async function cancelErrorMessage(res: Response): Promise<string> {
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

/** Mensagem real da API para o marcar-comparecimento (Story 3.7). */
export async function statusErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const m = body?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo JSON */
  }
  return "Não foi possível marcar o atendimento.";
}
