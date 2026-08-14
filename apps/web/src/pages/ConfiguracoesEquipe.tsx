import { useCallback, useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { authedRequest } from "../lib/session";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "../components/EmptyState";
import { ErrorState, errorKindFrom, type ErrorKind } from "../components/ErrorState";
import { Users } from "lucide-react";


// Papéis: Dono e Gestão. "Básico" foi aposentado (DL-062) — o que ele
// restringia virou a ausência dos flags de permissão (ver Story 5.1).
type AccessLevel = "owner" | "manager";
interface Member {
  id: string;
  name: string;
  email: string;
  accessLevel: AccessLevel;
  attendsClients: boolean;
  isActive: boolean;
  // Interruptores de permissão (DL-062). Só valem para Gestão; o Dono ignora.
  canViewFinanceiro: boolean;
  canViewDashboard: boolean;
  canManageAllAppointments: boolean;
}

const ROLE_LABEL: Record<AccessLevel, string> = {
  owner: "Dono",
  manager: "Gerente",
};

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

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
 * Configurações → Equipe (Story 3.3.3, owner-only). Lista a equipe, convida
 * (fluxo da 1.4), edita papel/atende (auto-save) e ativa/desativa com confirmação
 * (desativar dispara revogação imediata). Não deixa rebaixar/desativar o único Dono.
 */
export function ConfiguracoesEquipe() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorKind, setLoadErrorKind] = useState<ErrorKind | null>(null);
  const [error, setError] = useState<string | null>(null); // erro inline de PATCH
  const [confirmOff, setConfirmOff] = useState<string | null>(null); // membro a desativar

  // Convite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<"manager">("manager");
  const [invAttends, setInvAttends] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ownerCount = members.filter(
    (m) => m.accessLevel === "owner" && m.isActive,
  ).length;

  const loadMembers = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadErrorKind(null);
    try {
      const res = await authedRequest("/users", {});
      if (!res.ok) {
        setLoadErrorKind("server");
        return;
      }
      setMembers(((await res.json()) as { users: Member[] }).users);
    } catch (e) {
      setLoadErrorKind(errorKindFrom(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  /** PATCH de um membro; atualiza o estado no sucesso, mostra a mensagem real no erro. */
  async function patchMember(id: string, patch: Partial<Member>): Promise<void> {
    setError(null);
    const body: Record<string, unknown> = {};
    if (patch.accessLevel !== undefined) body.access_level = patch.accessLevel;
    if (patch.attendsClients !== undefined) body.attends_clients = patch.attendsClients;
    if (patch.isActive !== undefined) body.is_active = patch.isActive;
    if (patch.canViewFinanceiro !== undefined) body.can_view_financeiro = patch.canViewFinanceiro;
    if (patch.canViewDashboard !== undefined) body.can_view_dashboard = patch.canViewDashboard;
    if (patch.canManageAllAppointments !== undefined)
      body.can_manage_all_appointments = patch.canManageAllAppointments;

    const res = await authedRequest(`/users/${id}`, {
      method: "PATCH",
      body ,
    });
    if (!res.ok) {
      // ex.: 409 "Não é possível rebaixar ou desativar o único Dono…"
      setError(await apiError(res, "Não foi possível salvar a alteração."));
      return;
    }
    const updated = (await res.json()) as Member;
    setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
  }

  async function sendInvite(): Promise<void> {
    setError(null);
    setInviteLink(null);
    const res = await authedRequest("/users/invite", {
      method: "POST",
      body: {
        name: invName.trim(),
        email: invEmail.trim(),
        access_level: invRole,
        attends_clients: invAttends,
      } ,
    });
    if (!res.ok) {
      setError(await apiError(res, "Não foi possível gerar o convite."));
      return;
    }
    const data = (await res.json()) as { link: string };
    setInviteLink(data.link);
    setInvName("");
    setInvEmail("");
    await loadMembers();
  }

  async function copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível — o link fica visível para copiar à mão */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Convite */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          {!inviteOpen ? (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => {
                setInviteOpen(true);
                setInviteLink(null);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Convidar membro
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="inv-name">Nome</Label>
                  <Input id="inv-name" value={invName} onChange={(e) => setInvName(e.target.value)} />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="inv-email">E-mail</Label>
                  <Input
                    id="inv-email"
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="inv-role">Papel</Label>
                  <select
                    id="inv-role"
                    className={cn(inputCls, "w-40")}
                    value={invRole}
                    onChange={(e) => setInvRole(e.target.value as "manager")}
                  >
                    <option value="manager">Gerente</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={invAttends}
                    onChange={(e) => setInvAttends(e.target.checked)}
                  />
                  Atende clientes
                </label>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => void sendInvite()}>
                  Gerar convite
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setInviteOpen(false)}
                >
                  Fechar
                </Button>
              </div>
              {inviteLink && (
                <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-3">
                  <span className="text-xs text-muted-foreground">
                    Envie este link para a pessoa criar a senha e entrar:
                  </span>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={inviteLink} className="text-xs" />
                    <Button type="button" size="sm" onClick={() => void copyLink(inviteLink)}>
                      <Copy className="size-4" aria-hidden="true" />
                      {copied ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Lista da equipe — um CARD por pessoa (como a agenda, sem cores de
          status): tipo de conta, atende clientes e ativar/desativar legíveis.
          Antes: estados de carregamento/erro/vazio (Story 7.3). */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : loadErrorKind ? (
        <ErrorState
          kind={loadErrorKind}
          resource="a equipe"
          onRetry={() => void loadMembers()}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          compact
          title="Nenhum membro na equipe"
          description="Convide a primeira pessoa no botão acima."
        />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const isOwner = m.accessLevel === "owner";
          const lockOwner = isOwner && ownerCount <= 1; // único Dono (FR-I3)
          return (
            <div
              key={m.id}
              className={cn(
                "flex flex-col gap-3 rounded-lg border border-border bg-card p-4",
                !m.isActive && "opacity-60",
              )}
            >
              {/* Cabeçalho: nome + e-mail; selo "Inativa" quando sem acesso */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                {!m.isActive && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Inativa
                  </span>
                )}
              </div>

              {/* Tipo de conta (papel) — Dono é fixo; demais editáveis */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Tipo de conta</span>
                {isOwner ? (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-foreground">
                    {ROLE_LABEL.owner}
                  </span>
                ) : (
                  <select
                    aria-label={`Papel de ${m.name}`}
                    className={cn(inputCls, "w-36")}
                    value={m.accessLevel}
                    onChange={(e) =>
                      void patchMember(m.id, {
                        accessLevel: e.target.value as AccessLevel,
                      })
                    }
                  >
                    <option value="manager">Gerente</option>
                  </select>
                )}
              </div>

              {/* Atende clientes — toggle (mais legível que checkbox) */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Atende clientes</span>
                <ToggleSwitch
                  checked={m.attendsClients}
                  onChange={(v) => void patchMember(m.id, { attendsClients: v })}
                  label={`Atende clientes — ${m.name}`}
                />
              </div>

              {/* Interruptores de permissão (DL-062) — só para Gestão; o Dono
                  ignora (sempre pode). Concedidos só pelo Dono, OFF por padrão. */}
              {!isOwner && (
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Permissões
                  </span>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      Pode ver Financeiro
                    </span>
                    <ToggleSwitch
                      checked={m.canViewFinanceiro}
                      onChange={(v) =>
                        void patchMember(m.id, { canViewFinanceiro: v })
                      }
                      label={`Pode ver Financeiro — ${m.name}`}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      Pode ver Dashboard
                    </span>
                    <ToggleSwitch
                      checked={m.canViewDashboard}
                      onChange={(v) =>
                        void patchMember(m.id, { canViewDashboard: v })
                      }
                      label={`Pode ver Dashboard — ${m.name}`}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">
                      Pode gerenciar agendamentos de toda a equipe
                    </span>
                    <ToggleSwitch
                      checked={m.canManageAllAppointments}
                      onChange={(v) =>
                        void patchMember(m.id, { canManageAllAppointments: v })
                      }
                      label={`Pode gerenciar agendamentos de toda a equipe — ${m.name}`}
                    />
                  </div>
                </div>
              )}

              {/* Ativar/desativar — desativar exige confirmação (D2) */}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">
                  {m.isActive ? "Na equipe" : "Sem acesso"}
                </span>
                {m.isActive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={lockOwner}
                    onClick={() => setConfirmOff(m.id)}
                  >
                    Desativar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void patchMember(m.id, { isActive: true })}
                  >
                    Ativar
                  </Button>
                )}
              </div>
              {lockOwner && (
                <span className="text-[11px] text-muted-foreground">
                  Único Dono — transfira a titularidade antes.
                </span>
              )}

              {/* Confirmação de desativação (revogação imediata) */}
              {confirmOff === m.id && (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-sm text-foreground">
                    Desativar <strong>{m.name}</strong>? Ela sai da sessão na hora e perde o acesso.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setConfirmOff(null);
                        void patchMember(m.id, { isActive: false });
                      }}
                    >
                      Sim, desativar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmOff(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
