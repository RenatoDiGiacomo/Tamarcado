import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { authedRequest } from "../lib/session";
import { brl } from "../lib/currency";
import { PageLayout } from "../components/PageLayout";
import { EmptyState } from "../components/EmptyState";
import { ErrorState, errorKindFrom, type ErrorKind } from "../components/ErrorState";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

const PAGE_SIZE = 20;

interface ClientView {
  id: string;
  name: string;
  phone_whatsapp: string | null;
  /** Situação financeira (Story 5.5) — só vem para quem tem Financeiro (corte de valor). */
  finance?: { owed: number; paid: number };
}
interface ClientListResponse {
  clients: ClientView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Mensagem real da API (Nest `{ message }`) — não esconde a causa (padrão 3.3.1). */
async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string | string[] };
    const m = b?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo JSON */
  }
  return fallback;
}

/**
 * Clientes (Story 4.1) — listagem paginada + busca (nome/telefone), cadastro e
 * edição num modal. Reusa o CRUD de `/clients`. Perfil/histórico é a 4.2.
 */
export function Clientes() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal de cadastro/edição (editingId=null → cadastro).
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Busca com debounce leve; qualquer termo volta para a página 1.
  useEffect(() => {
    const h = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    const q = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (debounced !== "") q.set("search", debounced);
    try {
      const res = await authedRequest(`/clients?${q.toString()}`, {
        });
      if (!res.ok) {
        setErrorKind("server");
        setClients([]);
        setTotal(0);
        return;
      }
      const data = (await res.json()) as ClientListResponse;
      setClients(data.clients);
      setTotal(data.total);
    } catch (e) {
      setErrorKind(errorKindFrom(e));
      setClients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debounced, refreshKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openCreate(): void {
    setFormName("");
    setFormPhone("");
    setFormError(null);
    setFormOpen(true);
  }

  // Cadastro (a edição migrou para o perfil, Story 4.2).
  const save = useCallback(async () => {
    if (formName.trim() === "") {
      setFormError("Informe o nome da cliente.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const name = formName.trim();
    const phone = formPhone.trim();
    try {
      const res = await authedRequest("/clients", {
        method: "POST",
        body: { name, phone_whatsapp: phone || undefined } ,
      });
      if (!res.ok) {
        setFormError(await apiError(res, "Não foi possível salvar a cliente."));
        return;
      }
      setFormOpen(false);
      setRefreshKey((k) => k + 1);
      toast.success("Cliente cadastrada.");
    } catch {
      setFormError("Não foi possível salvar. Verifique sua conexão.");
    } finally {
      setSaving(false);
    }
  }, [formName, formPhone]);

  return (
    <PageLayout
      title="Clientes"
      action={
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Nova cliente
        </Button>
      }
    >
      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Buscar por nome ou telefone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar clientes"
        />
      </div>

      {loading && clients.length === 0 ? (
        <ClientesSkeleton />
      ) : errorKind ? (
        <ErrorState kind={errorKind} resource="os clientes" onRetry={() => void load()} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Users}
          compact
          title={
            debounced ? "Nenhuma cliente encontrada" : "Nenhuma cliente cadastrada"
          }
          description={
            debounced
              ? "Tente outro nome ou telefone."
              : "Cadastre a primeira cliente no botão acima."
          }
          action={
            debounced ? undefined : (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Nova cliente
              </Button>
            )
          }
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
            {clients.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {c.name}
                    </span>
                    {/* Situação financeira (5.5): indicador de "em aberto" ao lado
                        do nome — responde "quem me deve?" sem abrir a cliente. */}
                    {c.finance && c.finance.owed > 0 && (
                      <span
                        aria-label={`Em aberto: ${brl(c.finance.owed)}`}
                        className="shrink-0 rounded-full bg-status-pending/15 px-2 py-0.5 text-[11px] font-semibold text-status-pending"
                      >
                        Deve {brl(c.finance.owed)}
                      </span>
                    )}
                  </span>
                  <span
                    className={
                      c.phone_whatsapp
                        ? "shrink-0 text-muted-foreground"
                        : "shrink-0 italic text-muted-foreground"
                    }
                  >
                    {c.phone_whatsapp ?? "sem WhatsApp"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} cliente{total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                aria-label="Página anterior"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ‹
              </Button>
              <span>
                Página {page} de {pageCount}
              </span>
              <Button
                variant="secondary"
                aria-label="Próxima página"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
              >
                ›
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={(o) => !o && setFormOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova cliente</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cli-name">Nome</Label>
              <Input
                id="cli-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome da cliente"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cli-phone">WhatsApp (opcional)</Label>
              <Input
                id="cli-phone"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="(11) 99999-8888"
              />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

/** Esqueleto de carregamento (Story 7.3 §2) — linhas no formato da lista. */
function ClientesSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
