import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

const ACCESS_KEY = "tamarcado.access";
const token = (): string | null => localStorage.getItem(ACCESS_KEY);

/** Extrai a mensagem real de erro da API (Nest: `{ message: string | string[] }`)
 *  para não esconder a causa atrás de um texto genérico. */
async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const m = body?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo JSON — usa o fallback */
  }
  return fallback;
}

interface ServiceDto {
  id: string;
  name: string;
  isActive: boolean;
}
interface Attender {
  id: string;
  name: string;
}
interface ClientView {
  id: string;
  name: string;
  phone_whatsapp: string | null;
}
interface Slot {
  time: string;
}
type NoSlotsReason = "day_off" | "full" | "no_schedule_config";

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

/** Mensagem por motivo de não haver horários — diferencia "não atende" × "lotado"
 *  × "sem configuração" (em vez de um genérico "sem horários"). */
const NO_SLOTS_MSG: Record<NoSlotsReason, string> = {
  day_off: "Não há atendimento neste dia.",
  full: "Todos os horários estão ocupados neste dia.",
  // Sem horários configurados ainda: aponta para o caminho que EXISTE (encaixe),
  // não para uma aba de Configurações → Horários que ainda não foi construída.
  no_schedule_config:
    "Ainda não há horários de atendimento configurados. Use “Outro horário” para encaixar.",
};

/** Modo edição (Story 3.6): pré-preenche o formulário para editar um agendamento. */
export interface EditingAppointment {
  appointmentId: string;
  clientName: string;
  serviceId: string;
  professionalId: string | null;
  date: string;
  time: string;
}

/**
 * Novo agendamento manual (Story 3.3, D4 = modal sobre a agenda) — e **edição**
 * unificada (Story 3.6/DL-044). Cliente com busca + cadastro inline (FR-D7);
 * serviço; profissional (oculto para `basic`, D6); data/horário com slots livres
 * de `/availability` + "outro horário". Overbooking = aviso, não bloqueio (D1).
 * Cria via `POST /appointments`; em modo edição, **cliente fixo** e salva via
 * `PATCH /appointments/:id` (serviço + horário + profissional juntos).
 */
export function NovoAgendamento({
  open,
  onOpenChange,
  date,
  onCreated,
  initialClient,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  onCreated: (date: string) => void;
  /** Pré-seleciona a cliente (Story 4.2 — atalho do perfil). */
  initialClient?: ClientView | null;
  /** Modo edição (Story 3.6): pré-preenche e salva via PATCH; cliente fixo. */
  editing?: EditingAppointment | null;
}) {
  const { user } = useAuth();
  const isBasic = user?.accessLevel === "basic";

  const [services, setServices] = useState<ServiceDto[]>([]);
  const [attenders, setAttenders] = useState<Attender[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState(""); // "" = não atribuído
  const [formDate, setFormDate] = useState(date);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsReason, setSlotsReason] = useState<NoSlotsReason | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState(""); // chip selecionado
  const [customMode, setCustomMode] = useState(false); // "Outro horário"
  const [customTime, setCustomTime] = useState("");

  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientView[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientView | null>(null);
  const [addingClient, setAddingClient] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reabrir zera (ou pré-preenche, em edição) o formulário.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      // Modo edição (3.6): pré-preenche serviço/profissional/data/horário; cliente fixo.
      setFormDate(editing.date);
      setServiceId(editing.serviceId);
      setProfessionalId(editing.professionalId ?? "");
      setTime(editing.time);
      setCustomMode(false);
      setCustomTime("");
      setSlots([]);
      setSlotsReason(null);
      setSelectedClient({
        id: "fixed",
        name: editing.clientName,
        phone_whatsapp: null,
      });
      setClientQuery(editing.clientName);
    } else {
      setFormDate(date);
      setServiceId("");
      setProfessionalId("");
      setTime("");
      setCustomMode(false);
      setCustomTime("");
      setSlots([]);
      setSlotsReason(null);
      setClientQuery(initialClient?.name ?? "");
      setSelectedClient(initialClient ?? null);
    }
    setClientResults([]);
    setAddingClient(false);
    setNewName("");
    setNewPhone("");
    setError(null);
    void (async () => {
      const [svcRes, attRes] = await Promise.all([
        apiRequest("/services", { token: token() }),
        apiRequest("/users/attenders", { token: token() }),
      ]);
      if (svcRes.ok) {
        setServices(((await svcRes.json()) as { services: ServiceDto[] }).services);
      }
      if (attRes.ok) {
        setAttenders(((await attRes.json()) as { users: Attender[] }).users);
      }
    })();
  }, [open, date, initialClient, editing]);

  // Slots livres (+ motivo do vazio) para serviço + data (+ profissional).
  useEffect(() => {
    if (!open || !serviceId || !formDate) {
      setSlots([]);
      setSlotsReason(null);
      return;
    }
    setLoadingSlots(true);
    void (async () => {
      const q = new URLSearchParams({ serviceId, date: formDate });
      if (professionalId) q.set("professionalId", professionalId);
      try {
        const res = await apiRequest(`/availability?${q.toString()}`, {
          token: token(),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            slots: Slot[];
            reason: NoSlotsReason | null;
          };
          setSlots(data.slots);
          setSlotsReason(data.reason);
        } else {
          setSlots([]);
          setSlotsReason(null);
        }
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [open, serviceId, formDate, professionalId]);

  // Autocomplete de cliente (debounce leve).
  useEffect(() => {
    const term = clientQuery.trim();
    if (term.length < 2 || selectedClient) {
      setClientResults([]);
      return;
    }
    const h = setTimeout(() => {
      void apiRequest(`/clients?search=${encodeURIComponent(term)}`, {
        token: token(),
      }).then(async (res) => {
        if (res.ok) {
          setClientResults(((await res.json()) as { clients: ClientView[] }).clients);
        }
      });
    }, 250);
    return () => clearTimeout(h);
  }, [clientQuery, selectedClient]);

  const chosenTime = customMode ? customTime : time;
  const slotTimes = slots.map((s) => s.time);
  const freeTimes = new Set(slotTimes);
  const overbookWarn = chosenTime !== "" && !freeTimes.has(chosenTime);
  // Profissional específico + o horário escolhido cai DENTRO da janela de trabalho
  // dele (entre o primeiro e o último slot do dia) mas não está livre → ele já está
  // OCUPADO ali (não pode estar em dois lugares ao mesmo tempo). Nomeia explicitamente.
  // Fora dessa janela (após o fechamento, folga, sem config) é encaixe fora da
  // disponibilidade — não há conflito com outro atendimento, então cai no genérico.
  const selectedProfName = attenders.find((a) => a.id === professionalId)?.name;
  const withinWorkWindow =
    slotTimes.length > 0 &&
    chosenTime >= slotTimes[0] &&
    chosenTime <= slotTimes[slotTimes.length - 1];
  const overbookMsg =
    professionalId && selectedProfName && withinWorkWindow
      ? `${selectedProfName} já tem atendimento neste horário — deseja encaixar mesmo assim?`
      : "Esse horário está fora da disponibilidade — deseja encaixar mesmo assim?";

  const createClient = useCallback(async () => {
    if (newName.trim() === "") {
      setError("Informe o nome da cliente.");
      return;
    }
    const res = await apiRequest("/clients", {
      method: "POST",
      body: { name: newName.trim(), phone_whatsapp: newPhone.trim() || undefined },
      token: token(),
    });
    if (res.ok) {
      const c = (await res.json()) as ClientView;
      setSelectedClient(c);
      setAddingClient(false);
      setClientQuery(c.name);
      setError(null);
    } else {
      setError(await apiErrorMessage(res, "Não foi possível cadastrar a cliente."));
    }
  }, [newName, newPhone]);

  async function submit(): Promise<void> {
    setError(null);
    if (!selectedClient) return setError("Selecione ou cadastre a cliente.");
    if (!serviceId) return setError("Selecione o serviço.");
    if (chosenTime === "") return setError("Selecione o horário.");

    setSubmitting(true);
    try {
      if (editing) {
        // Edição (3.6): cliente fixo; envia serviço/horário/profissional. `basic`
        // assume para si (professionalId = self); owner/gerente enviam o escolhido.
        const res = await apiRequest(`/appointments/${editing.appointmentId}`, {
          method: "PATCH",
          body: {
            serviceId,
            date: formDate,
            time: chosenTime,
            professionalId: isBasic
              ? (user?.id ?? null)
              : professionalId || null,
          },
          token: token(),
        });
        if (!res.ok) {
          setError(
            await apiErrorMessage(res, "Não foi possível salvar as alterações."),
          );
          return;
        }
        onCreated(formDate);
        onOpenChange(false);
        return;
      }
      const res = await apiRequest("/appointments", {
        method: "POST",
        body: {
          client_id: selectedClient.id,
          service_id: serviceId,
          professional_id: isBasic ? undefined : professionalId || null,
          date: formDate,
          time: chosenTime,
        },
        token: token(),
      });
      if (!res.ok) {
        // Mostra a causa real (ex.: "A data deve ser hoje ou futura.").
        setError(
          await apiErrorMessage(res, "Não foi possível criar o agendamento."),
        );
        return;
      }
      const created = (await res.json()) as { date: string };
      onCreated(created.date);
      onOpenChange(false);
    } catch {
      setError("Não foi possível criar o agendamento. Verifique sua conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar agendamento" : "Novo agendamento"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Cliente */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cli">Cliente</Label>
            {selectedClient ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{selectedClient.name}</span>
                {!editing && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedClient(null);
                      setClientQuery("");
                    }}
                  >
                    trocar
                  </button>
                )}
              </div>
            ) : (
              <>
                <Input
                  id="cli"
                  placeholder="Buscar por nome ou telefone"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                {clientResults.length > 0 && (
                  <ul className="rounded-md border border-border">
                    {clientResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                          onClick={() => setSelectedClient(c)}
                        >
                          {c.name}
                          {c.phone_whatsapp ? (
                            <span className="text-muted-foreground"> · {c.phone_whatsapp}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!addingClient ? (
                  <button
                    type="button"
                    className="self-start text-sm text-primary hover:underline"
                    onClick={() => {
                      setAddingClient(true);
                      setNewName(clientQuery);
                    }}
                  >
                    + Nova cliente
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                    <Input
                      aria-label="Nome da nova cliente"
                      placeholder="Nome"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <Input
                      aria-label="WhatsApp (opcional)"
                      placeholder="WhatsApp (opcional)"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void createClient()}>
                        Criar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setAddingClient(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Serviço */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc">Serviço</Label>
            <select
              id="svc"
              className={inputCls}
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setTime("");
                setCustomMode(false);
              }}
            >
              <option value="">Selecione…</option>
              {services
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Profissional (oculto para basic — D6) */}
          {!isBasic && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prof">Profissional</Label>
              <select
                id="prof"
                className={inputCls}
                value={professionalId}
                onChange={(e) => {
                  setProfessionalId(e.target.value);
                  setTime("");
                }}
              >
                <option value="">Não atribuído</option>
                {attenders.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Data */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Data</Label>
            <input
              id="date"
              type="date"
              className={cn(inputCls, "sm:w-48")}
              value={formDate}
              onChange={(e) => {
                setFormDate(e.target.value);
                setTime("");
                setCustomMode(false);
              }}
            />
          </div>

          {/* Horário — grade de chips visíveis (o padrão de agendamento: bate o
              olho e vê o que tem). "Outro horário" fica discreto abaixo, p/ encaixe. */}
          <div className="flex flex-col gap-2">
            <Label>Horário</Label>
            {!serviceId ? (
              <p className="text-sm text-muted-foreground">
                Escolha o serviço primeiro.
              </p>
            ) : loadingSlots ? (
              <p className="text-sm text-muted-foreground">Carregando horários…</p>
            ) : slots.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {slots.map((s) => {
                  const active = !customMode && time === s.time;
                  return (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => {
                        setTime(s.time);
                        setCustomMode(false);
                      }}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-sm tabular-nums transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      {s.time}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {slotsReason ? NO_SLOTS_MSG[slotsReason] : "Sem horários livres."}
              </p>
            )}

            {serviceId && !loadingSlots && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomMode((v) => !v);
                    setTime("");
                  }}
                  className={cn(
                    "text-sm hover:underline",
                    customMode ? "font-medium text-foreground" : "text-primary",
                  )}
                >
                  {customMode ? "Escolher da grade" : "Outro horário…"}
                </button>
                {customMode && (
                  <Input
                    aria-label="Outro horário"
                    type="time"
                    className="h-8 w-32"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          {overbookWarn && (
            <p role="alert" className="text-sm text-status-noshow">
              {overbookMsg}
            </p>
          )}

          {!editing && (
            <p className="text-xs text-muted-foreground">
              Entra como: <strong className="text-foreground">Confirmado</strong>, sem aprovação.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className={cn(overbookWarn && "bg-status-noshow hover:bg-status-noshow/90")}
            >
              {submitting
                ? "Salvando…"
                : editing
                  ? "Salvar alterações"
                  : "Agendar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
