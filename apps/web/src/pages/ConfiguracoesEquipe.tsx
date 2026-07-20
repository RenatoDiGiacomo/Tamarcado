import { useCallback, useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { apiRequest } from "../lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const ACCESS_KEY = "tamarcado.access";
const token = (): string | null => localStorage.getItem(ACCESS_KEY);

type AccessLevel = "owner" | "manager" | "basic";
interface Member {
  id: string;
  name: string;
  email: string;
  accessLevel: AccessLevel;
  attendsClients: boolean;
  isActive: boolean;
}

const ROLE_LABEL: Record<AccessLevel, string> = {
  owner: "Dono",
  manager: "Gerente",
  basic: "Básico",
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
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null); // membro a desativar

  // Convite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<"manager" | "basic">("basic");
  const [invAttends, setInvAttends] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ownerCount = members.filter(
    (m) => m.accessLevel === "owner" && m.isActive,
  ).length;

  const loadMembers = useCallback(async (): Promise<void> => {
    const res = await apiRequest("/users", { token: token() });
    if (res.ok) {
      setMembers(((await res.json()) as { users: Member[] }).users);
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

    const res = await apiRequest(`/users/${id}`, {
      method: "PATCH",
      body,
      token: token(),
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
    const res = await apiRequest("/users/invite", {
      method: "POST",
      body: {
        name: invName.trim(),
        email: invEmail.trim(),
        access_level: invRole,
        attends_clients: invAttends,
      },
      token: token(),
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
                    onChange={(e) => setInvRole(e.target.value as "manager" | "basic")}
                  >
                    <option value="basic">Básico</option>
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

      {/* Lista da equipe */}
      <Card>
        <CardContent className="flex flex-col p-0">
          {members.map((m) => {
            const isOwner = m.accessLevel === "owner";
            const lockOwner = isOwner && ownerCount <= 1; // único Dono (FR-I3)
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-wrap items-center gap-4 border-b border-border px-4 py-3 last:border-b-0",
                  !m.isActive && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>

                {/* Papel */}
                {isOwner ? (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-foreground">
                    {ROLE_LABEL.owner}
                  </span>
                ) : (
                  <select
                    aria-label={`Papel de ${m.name}`}
                    className={cn(inputCls, "w-32")}
                    value={m.accessLevel}
                    onChange={(e) =>
                      void patchMember(m.id, {
                        accessLevel: e.target.value as AccessLevel,
                      })
                    }
                  >
                    <option value="basic">Básico</option>
                    <option value="manager">Gerente</option>
                  </select>
                )}

                {/* Atende clientes */}
                <label className="flex w-28 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={m.attendsClients}
                    aria-label={`Atende clientes — ${m.name}`}
                    onChange={(e) =>
                      void patchMember(m.id, { attendsClients: e.target.checked })
                    }
                  />
                  Atende
                </label>

                {/* Ativo/inativo — desativar exige confirmação (D2) */}
                <div className="flex w-44 shrink-0 flex-col items-end gap-1">
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
                  {lockOwner && (
                    <span className="text-[11px] text-muted-foreground">
                      Único Dono — transfira a titularidade antes.
                    </span>
                  )}
                </div>

                {/* Confirmação de desativação (revogação imediata) */}
                {confirmOff === m.id && (
                  <div className="flex w-full flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
                    <p className="text-sm text-foreground">
                      Desativar <strong>{m.name}</strong>? Ela sai da sessão na hora e perde o acesso.
                    </p>
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
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
