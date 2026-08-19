import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, Pencil, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { authedRequest } from "../lib/session";
import { brl } from "../lib/currency";
import { PageLayout } from "../components/PageLayout";
import { EmptyState } from "../components/EmptyState";
import { StatusChip } from "../components/StatusChip";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { NovoAgendamento } from "./NovoAgendamento";
import { mapStatus } from "./agendaMap";


interface ClientProfile {
  id: string;
  name: string;
  phone_whatsapp: string | null;
  notes: string | null;
  createdAt: string;
  /** Situação financeira (Story 5.5) — só para quem tem Financeiro (corte de valor). */
  finance?: { owed: number; paid: number };
}
interface HistoryItem {
  id: string;
  serviceName: string;
  professionalName: string | null;
  date: string; // YYYY-MM-DD
  start: string;
  end: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
}

/** `YYYY-MM-DD` (ou ISO) → `DD/MM/YYYY`, estável (sem locale). */
function ddmmyyyy(value: string): string {
  return value.slice(0, 10).split("-").reverse().join("/");
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
 * Perfil da cliente (Story 4.2): dados + observações editáveis + histórico de
 * agendamentos, com atalho para agendar já com a cliente selecionada. Fecha o Épico 4.
 */
export function ClientePerfil() {
  const { id = "" } = useParams();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // Editar dados (nome/WhatsApp) — reusa o form da 4.1.
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [novoOpen, setNovoOpen] = useState(false);

  // Estável entre renders (senão o reset do NovoAgendamento re-dispara a cada render).
  const initialClient = useMemo(
    () =>
      profile
        ? { id: profile.id, name: profile.name, phone_whatsapp: profile.phone_whatsapp }
        : null,
    [profile],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const [pRes, hRes] = await Promise.all([
        authedRequest(`/clients/${id}`, {}),
        authedRequest(`/clients/${id}/appointments`, {}),
      ]);
      if (!pRes.ok) throw new Error("load");
      const p = (await pRes.json()) as ClientProfile;
      setProfile(p);
      setNotes(p.notes ?? "");
      if (hRes.ok) {
        setHistory(
          ((await hRes.json()) as { appointments: HistoryItem[] }).appointments,
        );
      }
    } catch {
      setError(true);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [id, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNotes = useCallback(async () => {
    setNotesSaving(true);
    setNotesError(null);
    try {
      const res = await authedRequest(`/clients/${id}`, {
        method: "PATCH",
        body: { notes } ,
      });
      if (!res.ok) {
        setNotesError(await apiError(res, "Não foi possível salvar a observação."));
        return;
      }
      toast.success("Observação salva.");
    } catch {
      setNotesError("Não foi possível salvar. Verifique sua conexão.");
    } finally {
      setNotesSaving(false);
    }
  }, [id, notes]);

  function openEdit(): void {
    if (!profile) return;
    setEditName(profile.name);
    setEditPhone(profile.phone_whatsapp ?? "");
    setEditError(null);
    setEditOpen(true);
  }

  const saveEdit = useCallback(async () => {
    if (editName.trim() === "") {
      setEditError("Informe o nome da cliente.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await authedRequest(`/clients/${id}`, {
        method: "PATCH",
        body: { name: editName.trim(), phone_whatsapp: editPhone.trim() } ,
      });
      if (!res.ok) {
        setEditError(await apiError(res, "Não foi possível salvar a cliente."));
        return;
      }
      setEditOpen(false);
      setRefreshKey((k) => k + 1);
      toast.success("Cliente atualizada.");
    } catch {
      setEditError("Não foi possível salvar. Verifique sua conexão.");
    } finally {
      setEditSaving(false);
    }
  }, [id, editName, editPhone]);

  if (loading && !profile) {
    return (
      <PageLayout title="Cliente">
        <p className="text-sm text-muted-foreground">Carregando perfil…</p>
      </PageLayout>
    );
  }
  if (error || !profile) {
    return (
      <PageLayout title="Cliente">
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar o perfil desta cliente.
        </p>
        <Link to="/clientes" className="mt-3 inline-block text-sm text-primary">
          ← Voltar para Clientes
        </Link>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={profile.name}
      action={
        <Button onClick={() => setNovoOpen(true)}>
          <CalendarPlus className="size-4" /> Novo agendamento
        </Button>
      }
    >
      <Link
        to="/clientes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <div className="flex flex-col gap-6">
        {/* Cabeçalho: dados */}
        <section className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">WhatsApp:</dt>
              <dd
                className={
                  profile.phone_whatsapp ? "text-foreground" : "italic text-muted-foreground"
                }
              >
                {profile.phone_whatsapp ?? "sem WhatsApp"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Cliente desde:</dt>
              <dd className="text-foreground">{ddmmyyyy(profile.createdAt)}</dd>
            </div>
            {/* Situação financeira (5.5) — só vem para quem tem Financeiro. */}
            {profile.finance && (
              <>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Em aberto:</dt>
                  <dd
                    className={
                      profile.finance.owed > 0
                        ? "font-semibold text-status-pending"
                        : "text-foreground"
                    }
                  >
                    {brl(profile.finance.owed)}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Já pago:</dt>
                  <dd className="text-status-confirmed">
                    {brl(profile.finance.paid)}
                  </dd>
                </div>
              </>
            )}
          </dl>
          <Button variant="secondary" onClick={openEdit}>
            <Pencil className="size-4" /> Editar
          </Button>
        </section>

        {/* Observações */}
        <section className="flex flex-col gap-2">
          <Label htmlFor="notes">Observações</Label>
          <textarea
            id="notes"
            aria-label="Observações da cliente"
            rows={4}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Preferências, alergias, histórico relevante…"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {notesError && (
            <p role="alert" className="text-sm text-destructive">
              {notesError}
            </p>
          )}
          <div>
            <Button onClick={() => void saveNotes()} disabled={notesSaving}>
              {notesSaving ? "Salvando…" : "Salvar observação"}
            </Button>
          </div>
        </section>

        {/* Histórico */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Histórico de agendamentos
          </h2>
          {history.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nenhum agendamento ainda"
              description="Os agendamentos desta cliente aparecem aqui."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
              {history.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {a.serviceName}
                    </span>
                    <span className="text-muted-foreground">
                      {ddmmyyyy(a.date)} · {a.start}–{a.end} ·{" "}
                      {a.professionalName ?? (
                        <em className="italic">Não atribuído</em>
                      )}
                    </span>
                  </div>
                  <StatusChip status={mapStatus(a.status)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Editar dados (nome/WhatsApp) */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-phone">WhatsApp (opcional)</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="(11) 99999-8888"
              />
            </div>
            {editError && (
              <p role="alert" className="text-sm text-destructive">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setEditOpen(false)}
                disabled={editSaving}
              >
                Cancelar
              </Button>
              <Button onClick={() => void saveEdit()} disabled={editSaving}>
                {editSaving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Atalho: novo agendamento com a cliente pré-selecionada */}
      <NovoAgendamento
        open={novoOpen}
        onOpenChange={setNovoOpen}
        date={new Date().toISOString().slice(0, 10)}
        initialClient={initialClient}
        onCreated={() => {
          setNovoOpen(false);
          setRefreshKey((k) => k + 1); // o novo agendamento aparece no histórico
        }}
      />
    </PageLayout>
  );
}
