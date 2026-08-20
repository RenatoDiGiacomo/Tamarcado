import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Plus, Wallet } from "lucide-react";
import { authedRequest } from "../lib/session";
import { brl, maskBRL, brlToNumber } from "../lib/currency";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/AuthContext";
import { PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "../components/EmptyState";
import { ErrorState, errorKindFrom, type ErrorKind } from "../components/ErrorState";
import { Users } from "lucide-react";

type AccessLevel = "owner" | "professional";
type Cadence = "daily" | "weekly" | "monthly";
type Scope = "none" | "professional" | "service";
type Kind = "percent" | "fixed";

interface Remuneration {
  salaryAmount: number | null;
  salaryCadence: Cadence | null;
  commissionScope: Scope;
  commissionKind: Kind | null;
  commissionValue: number | null;
}
interface SvcComm {
  serviceId: string;
  serviceName: string;
  kind: Kind | null;
  value: number | null;
}
interface Forecast {
  commission: number;
  salary: number;
  total: number;
}
interface Member {
  id: string;
  name: string;
  email: string;
  accessLevel: AccessLevel;
  attendsClients: boolean;
  isActive: boolean;
  canViewFinanceiro: boolean;
  canViewDashboard: boolean;
  canViewEquipe: boolean;
  canManageAllAppointments: boolean;
  remuneration: Remuneration;
  serviceCommissions: SvcComm[];
  forecast: Forecast;
}

type Preset = "dia" | "semana" | "mes" | "ano";

const CADENCE_LABEL: Record<Cadence, string> = { daily: "Diário", weekly: "Semanal", monthly: "Mensal" };
const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50";

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function rangeFor(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "dia") return { from: ymd(now), to: ymd(now) };
  if (preset === "semana") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: ymd(mon), to: ymd(sun) };
  }
  if (preset === "ano") return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}
const brDate = (d: string) => d.split("-").reverse().join("/");

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

function remuneracaoResumo(r: Remuneration): string {
  const parts: string[] = [];
  if (r.salaryCadence && r.salaryAmount != null)
    parts.push(`${brl(r.salaryAmount)}/${CADENCE_LABEL[r.salaryCadence].toLowerCase()}`);
  if (r.commissionScope === "professional" && r.commissionKind)
    parts.push(
      r.commissionKind === "percent"
        ? `${r.commissionValue ?? 0}% por atendimento`
        : `${brl(r.commissionValue ?? 0)} por atendimento`,
    );
  if (r.commissionScope === "service") parts.push("comissão por serviço");
  return parts.length ? parts.join(" · ") : "Sem remuneração definida";
}

/**
 * Equipe (Story 5.9) — menu próprio. VER é gateado pelo módulo `equipe` (owner OU
 * can_view_equipe); EDITAR (convite, papel/permissões, remuneração, ativar) é
 * **owner-only**. Lista compacta com dropdown (accordion) — escala para equipes
 * grandes — com filtro por nome e a PREVISÃO do período por pessoa. NÃO é caixa.
 */
export function Equipe() {
  const { user } = useAuth();
  const isOwner = user?.accessLevel === "owner";
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorKind, setLoadErrorKind] = useState<ErrorKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("mes");
  const [range, setRange] = useState(() => rangeFor("mes"));
  const [editing, setEditing] = useState<Member | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");

  // Convite (dialog)
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invAttends, setInvAttends] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ownerCount = members.filter((m) => m.accessLevel === "owner" && m.isActive).length;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadErrorKind(null);
    try {
      const res = await authedRequest(`/team?from=${range.from}&to=${range.to}`);
      if (!res.ok) {
        setLoadErrorKind("server");
        return;
      }
      setMembers(((await res.json()) as { members: Member[] }).members);
    } catch (e) {
      setLoadErrorKind(errorKindFrom(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchMember(id: string, patch: Record<string, unknown>): Promise<void> {
    setError(null);
    const res = await authedRequest(`/users/${id}`, { method: "PATCH", body: patch });
    if (!res.ok) {
      setError(await apiError(res, "Não foi possível salvar a alteração."));
      return;
    }
    await load();
  }

  async function saveRemuneration(id: string, body: Record<string, unknown>): Promise<void> {
    setError(null);
    const res = await authedRequest(`/team/${id}/remuneration`, { method: "PATCH", body });
    if (!res.ok) {
      setError(await apiError(res, "Não foi possível salvar a remuneração."));
      return;
    }
    setEditing(null);
    await load();
  }

  async function sendInvite(): Promise<void> {
    setError(null);
    setInviteLink(null);
    const res = await authedRequest("/users/invite", {
      method: "POST",
      body: { name: invName.trim(), email: invEmail.trim(), access_level: "professional", attends_clients: invAttends },
    });
    if (!res.ok) {
      setError(await apiError(res, "Não foi possível gerar o convite."));
      return;
    }
    setInviteLink(((await res.json()) as { link: string }).link);
    setInvName("");
    setInvEmail("");
    await load();
  }

  async function copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível */
    }
  }

  function applyPreset(p: Preset): void {
    setPreset(p);
    setRange(rangeFor(p));
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "dia", label: "Dia" },
    { key: "semana", label: "Semana" },
    { key: "mes", label: "Mês" },
    { key: "ano", label: "Ano" },
  ];

  const filtered = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    return q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;
  }, [members, nameFilter]);

  return (
    <PageLayout title="Equipe">
      <div className="flex flex-col gap-4">
        {/* Período da PREVISÃO + Convidar (owner) na mesma linha */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-input">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  preset === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            Previsão de {brDate(range.from)} a {brDate(range.to)}
            <InfoTip
              text="Previsão do que cada pessoa tem a receber no período: comissão (apurada por atendimento CONCLUÍDO) + salário fixo rateado pelos dias. Não é o pagamento efetivo — esse é registrado no Financeiro."
              label="O que é a previsão?"
            />
          </span>
          {isOwner && (
            <Button
              type="button"
              variant="secondary"
              className="ml-auto"
              onClick={() => {
                setInviteLink(null);
                setInviteOpen(true);
              }}
            >
              <Plus className="size-4" /> Convidar membro
            </Button>
          )}
        </div>

        {/* Filtro por nome */}
        <Input
          aria-label="Filtrar por nome"
          placeholder="Filtrar por nome"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className="max-w-xs"
        />

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : loadErrorKind ? (
          <ErrorState kind={loadErrorKind} resource="a equipe" onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            compact
            title={nameFilter ? "Nenhum membro encontrado" : "Nenhum membro na equipe"}
            description={nameFilter ? "Tente outro nome." : "Convide a primeira pessoa no botão acima."}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
            {filtered.map((m) => {
              const isOwnerRow = m.accessLevel === "owner";
              const lockOwner = isOwnerRow && ownerCount <= 1;
              const open = expanded === m.id;
              return (
                <li key={m.id} className={cn(!m.isActive && "opacity-60")}>
                  {/* Cabeçalho clicável (accordion) */}
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : m.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">{m.name}</span>
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          {isOwnerRow ? "Dono" : "Profissional"}
                        </span>
                        {!m.isActive && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Inativa
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Previsão</div>
                      <div className="text-sm font-semibold tabular-nums text-status-confirmed">{brl(m.forecast.total)}</div>
                    </div>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  </button>

                  {/* Conteúdo expandido */}
                  {open && (
                    <div className="flex flex-col gap-3 border-t border-border px-4 pb-4 pt-3">
                      {/* Remuneração + previsão detalhada */}
                      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Remuneração</span>
                          {isOwner && (
                            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(m)}>
                              <Wallet className="size-4" /> Editar
                            </Button>
                          )}
                        </div>
                        <p className="text-sm text-foreground">{remuneracaoResumo(m.remuneration)}</p>
                        <div className="text-xs text-muted-foreground">
                          Comissão {brl(m.forecast.commission)} · Salário {brl(m.forecast.salary)} · Previsão {brl(m.forecast.total)}
                        </div>
                      </div>

                      {/* Ações do Dono */}
                      {isOwner && (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-muted-foreground">Atende clientes</span>
                            <ToggleSwitch checked={m.attendsClients} onChange={(v) => void patchMember(m.id, { attends_clients: v })} label={`Atende clientes — ${m.name}`} />
                          </div>

                          {!isOwnerRow && (
                            <div className="flex flex-col gap-2 border-t border-border pt-3">
                              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Permissões</span>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-muted-foreground">Pode ver Financeiro</span>
                                <ToggleSwitch checked={m.canViewFinanceiro} onChange={(v) => void patchMember(m.id, { can_view_financeiro: v })} label={`Pode ver Financeiro — ${m.name}`} />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-muted-foreground">Pode ver Dashboard</span>
                                <ToggleSwitch checked={m.canViewDashboard} onChange={(v) => void patchMember(m.id, { can_view_dashboard: v })} label={`Pode ver Dashboard — ${m.name}`} />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-muted-foreground">Pode ver Equipe</span>
                                <ToggleSwitch checked={m.canViewEquipe} onChange={(v) => void patchMember(m.id, { can_view_equipe: v })} label={`Pode ver Equipe — ${m.name}`} />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-muted-foreground">Pode gerenciar agendamentos de toda a equipe</span>
                                <ToggleSwitch checked={m.canManageAllAppointments} onChange={(v) => void patchMember(m.id, { can_manage_all_appointments: v })} label={`Pode gerenciar agendamentos de toda a equipe — ${m.name}`} />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                            <span className="text-sm text-muted-foreground">{m.isActive ? "Na equipe" : "Sem acesso"}</span>
                            {m.isActive ? (
                              <Button type="button" size="sm" variant="secondary" disabled={lockOwner} onClick={() => setConfirmOff(m.id)}>Desativar</Button>
                            ) : (
                              <Button type="button" size="sm" onClick={() => void patchMember(m.id, { is_active: true })}>Ativar</Button>
                            )}
                          </div>
                          {lockOwner && <span className="text-[11px] text-muted-foreground">Único Dono — transfira a titularidade antes.</span>}
                          {confirmOff === m.id && (
                            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
                              <p className="text-sm text-foreground">
                                Desativar <strong>{m.name}</strong>? Ela sai da sessão na hora e perde o acesso.
                              </p>
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="destructive" onClick={() => { setConfirmOff(null); void patchMember(m.id, { is_active: false }); }}>Sim, desativar</Button>
                                <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmOff(null)}>Cancelar</Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Convite (dialog) */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar membro</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-name">Nome</Label>
              <Input id="inv-name" value={invName} onChange={(e) => setInvName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-email">E-mail</Label>
              <Input id="inv-email" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={invAttends} onChange={(e) => setInvAttends(e.target.checked)} />
              Atende clientes
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Fechar</Button>
              <Button type="button" onClick={() => void sendInvite()}>Gerar convite</Button>
            </div>
            {inviteLink && (
              <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-3">
                <span className="text-xs text-muted-foreground">Envie este link para a pessoa criar a senha e entrar:</span>
                <div className="flex items-center gap-2">
                  <Input readOnly value={inviteLink} className="text-xs" />
                  <Button type="button" size="sm" onClick={() => void copyLink(inviteLink)}>
                    <Copy className="size-4" /> {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editing && (
        <RemuneracaoDialog member={editing} onClose={() => setEditing(null)} onSave={(body) => void saveRemuneration(editing.id, body)} />
      )}
    </PageLayout>
  );
}

/** Editor de remuneração de um membro: salário fixo + comissão (prof/serviço). */
function RemuneracaoDialog({
  member,
  onClose,
  onSave,
}: {
  member: Member;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const r = member.remuneration;
  const [cadence, setCadence] = useState<Cadence | "none">(r.salaryCadence ?? "none");
  const [salary, setSalary] = useState(r.salaryAmount != null ? brl(r.salaryAmount) : "");
  const [scope, setScope] = useState<Scope>(r.commissionScope);
  const [kind, setKind] = useState<Kind>(r.commissionKind ?? "percent");
  const [percent, setPercent] = useState(r.commissionKind === "percent" && r.commissionValue != null ? String(r.commissionValue) : "");
  const [fixed, setFixed] = useState(r.commissionKind === "fixed" && r.commissionValue != null ? brl(r.commissionValue) : "");
  const [svc, setSvc] = useState<SvcComm[]>(member.serviceCommissions);

  function setSvcRow(serviceId: string, patch: Partial<SvcComm>): void {
    setSvc((prev) => prev.map((s) => (s.serviceId === serviceId ? { ...s, ...patch } : s)));
  }

  function submit(): void {
    const body: Record<string, unknown> = {
      salaryAmount: cadence === "none" ? null : brlToNumber(salary),
      salaryCadence: cadence === "none" ? null : cadence,
      commissionScope: scope,
      commissionKind: scope === "professional" ? kind : null,
      commissionValue:
        scope === "professional"
          ? kind === "percent"
            ? Number(percent.replace(",", ".")) || 0
            : brlToNumber(fixed)
          : null,
    };
    if (scope === "service") {
      body.serviceCommissions = svc.map((s) => ({ serviceId: s.serviceId, kind: s.kind, value: s.value }));
    }
    onSave(body);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remuneração — {member.name}</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Salário fixo</span>
            <div className="flex gap-2">
              <select aria-label="Cadência do salário" className={cn(inputCls, "w-36")} value={cadence} onChange={(e) => setCadence(e.target.value as Cadence | "none")}>
                <option value="none">Sem salário</option>
                <option value="daily">Diário</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
              {cadence !== "none" && (
                <Input aria-label="Valor do salário" inputMode="numeric" placeholder="R$ 0,00" value={salary} onChange={(e) => setSalary(maskBRL(e.target.value))} />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Comissão</span>
            <select aria-label="Origem da comissão" className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="none">Sem comissão</option>
              <option value="professional">Por profissional (uma taxa)</option>
              <option value="service">Por serviço</option>
            </select>

            {scope === "professional" && (
              <div className="mt-1 flex gap-2">
                <select aria-label="Tipo da comissão" className={cn(inputCls, "w-36")} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                  <option value="percent">Percentual</option>
                  <option value="fixed">Valor fixo</option>
                </select>
                {kind === "percent" ? (
                  <div className="relative flex-1">
                    <Input aria-label="Percentual da comissão" inputMode="decimal" placeholder="30" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.,]/g, ""))} className="pr-7" />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                ) : (
                  <Input aria-label="Valor fixo da comissão" inputMode="numeric" placeholder="R$ 0,00" value={fixed} onChange={(e) => setFixed(maskBRL(e.target.value))} />
                )}
              </div>
            )}

            {scope === "service" && (
              <div className="mt-1 flex flex-col gap-2">
                {svc.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem serviços vinculados a esta pessoa. Vincule em Configurações → Serviços.</p>
                ) : (
                  svc.map((s) => (
                    <div key={s.serviceId} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-sm text-foreground" title={s.serviceName}>{s.serviceName}</span>
                      <select
                        aria-label={`Tipo da comissão de ${s.serviceName}`}
                        className={cn(inputCls, "w-28")}
                        value={s.kind ?? "none"}
                        onChange={(e) => setSvcRow(s.serviceId, { kind: e.target.value === "none" ? null : (e.target.value as Kind), value: e.target.value === "none" ? null : s.value })}
                      >
                        <option value="none">Sem</option>
                        <option value="percent">%</option>
                        <option value="fixed">Fixo</option>
                      </select>
                      {s.kind && (
                        <Input
                          aria-label={`Valor da comissão de ${s.serviceName}`}
                          inputMode="decimal"
                          placeholder={s.kind === "percent" ? "30" : "0,00"}
                          value={s.value != null ? String(s.value).replace(".", ",") : ""}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
                            setSvcRow(s.serviceId, { value: raw === "" ? null : Number(raw) });
                          }}
                          className="w-24"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
