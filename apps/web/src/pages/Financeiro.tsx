import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Download, Wallet } from "lucide-react";
import { authedRequest } from "../lib/session";
import { useAuth } from "../auth/AuthContext";
import { RegistrarSaidaDialog } from "@/components/financeiro/RegistrarSaidaDialog";
import { brl } from "../lib/currency";
import { toCsv, csvAmount, downloadCsv } from "../lib/csv";
import { cn } from "@/lib/utils";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import {
  ErrorState,
  errorKindFrom,
  type ErrorKind,
} from "@/components/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentForm } from "@/components/agenda/PaymentForm";

type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito" | "outro";
const METHOD_LABEL: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  outro: "Outro",
};
const METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[];

interface Receipt {
  appointmentId: string;
  clientId: string | null;
  clientName: string;
  serviceName: string;
  date: string; // YYYY-MM-DD
  amount: number;
  method: PaymentMethod | null;
  status: "pago" | "pendente";
}
interface ReceiptsData {
  receipts: Receipt[];
  totalReceived: number;
  totalPending: number;
}

/** SAÍDA — pagamento à equipe (Story 5.10). */
interface TeamPayment {
  id: string;
  professionalName: string;
  amount: number;
  paidOn: string;
  periodFrom: string;
  periodTo: string;
  note: string | null;
}
interface ExpensesData {
  payments: TeamPayment[];
  total: number;
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Intervalo padrão inicial: mês corrente (o período é ajustado pelo De/Até). */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}

/** Cliente da busca (autocomplete por nome/telefone), como no Novo agendamento. */
interface ClientLite {
  id: string;
  name: string;
  phone_whatsapp: string | null;
}

const controlCls =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";
const brDate = (d: string) => d.split("-").reverse().join("/");

/**
 * Financeiro — Recebimentos (Stories 5.2/5.3/5.4/5.5). Menu próprio, só para quem
 * tem o módulo (DL-062; gate no backend e na rota). Central de ENTRADAS: totais
 * recebido/pendente no topo, período por De/Até e filtros de situação/forma, com
 * a CLIENTE por busca (nome/telefone, como no Novo agendamento). Exportar CSV
 * confirma num modal (5.4; PDF ficou fora, DL-061). O registro do pagamento
 * acontece no Financeiro e no perfil da cliente (DL-066).
 */
export function Financeiro() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user?.accessLevel === "owner";
  const [from, setFrom] = useState(currentMonthRange().from);
  const [to, setTo] = useState(currentMonthRange().to);
  const [statusF, setStatusF] = useState<"all" | "pago" | "pendente">("all");
  const [methodF, setMethodF] = useState<"all" | PaymentMethod>("all");
  // Filtro de cliente por BUSCA (autocomplete nome/telefone), como no Novo
  // agendamento. `selectedClient` fixa o filtro; a lista recorta por `clientId`.
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientLite[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientLite | null>(null);
  const [data, setData] = useState<ReceiptsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  // Recebimento sendo editado (Story 5.2 / DL-065): fechar o caixa aqui, sem ir
  // à Agenda. Abre o MESMO PaymentForm do agendamento num dialog.
  const [editing, setEditing] = useState<Receipt | null>(null);
  // Exportação CSV (Story 5.4): confirma num modal antes de baixar.
  const [exportOpen, setExportOpen] = useState(false);
  // Saídas — pagamentos à equipe (Story 5.10).
  const [expenses, setExpenses] = useState<ExpensesData | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    try {
      const [rRes, eRes] = await Promise.all([
        authedRequest(`/appointments/payments?from=${from}&to=${to}`),
        authedRequest(`/team/payments?from=${from}&to=${to}`),
      ]);
      if (!rRes.ok) {
        setErrorKind("server");
        setData(null);
        return;
      }
      setData((await rRes.json()) as ReceiptsData);
      setExpenses(eRes.ok ? ((await eRes.json()) as ExpensesData) : { payments: [], total: 0 });
    } catch (e) {
      setErrorKind(errorKindFrom(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Autocomplete da cliente (debounce leve) — busca por nome/telefone no backend,
  // igual ao Novo agendamento. Some quando já há cliente selecionada.
  useEffect(() => {
    const term = clientQuery.trim();
    if (term.length < 2 || selectedClient) {
      setClientResults([]);
      return;
    }
    const h = setTimeout(() => {
      void authedRequest(`/clients?search=${encodeURIComponent(term)}`).then(
        async (res) => {
          if (res.ok) {
            setClientResults(
              ((await res.json()) as { clients: ClientLite[] }).clients,
            );
          }
        },
      );
    }, 250);
    return () => clearTimeout(h);
  }, [clientQuery, selectedClient]);

  // Situação/forma/cliente aplicados no cliente (o período já é a consulta).
  const filtered = useMemo(
    () =>
      (data?.receipts ?? []).filter(
        (r) =>
          (statusF === "all" || r.status === statusF) &&
          (methodF === "all" || r.method === methodF) &&
          (selectedClient === null || r.clientId === selectedClient.id),
      ),
    [data, statusF, methodF, selectedClient],
  );

  // Agrupa por data (mais recente primeiro) para separar visualmente a lista.
  const groups = useMemo(() => {
    const map = new Map<string, Receipt[]>();
    for (const r of filtered) {
      const arr = map.get(r.date) ?? [];
      arr.push(r);
      map.set(r.date, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  // Exporta o que está NA TELA (filtros aplicados) para CSV (Story 5.4).
  function exportCsv(): void {
    const rows = filtered.map((r) => [
      brDate(r.date),
      r.clientName,
      r.serviceName,
      r.method ? METHOD_LABEL[r.method] : "",
      r.status === "pago" ? "Pago" : "Pendente",
      csvAmount(r.amount),
    ]);
    const csv = toCsv(
      ["Data", "Cliente", "Serviço", "Forma", "Situação", "Valor"],
      rows,
    );
    downloadCsv(`recebimentos_${from}_a_${to}.csv`, csv);
    setExportOpen(false);
  }

  return (
    <PageLayout title="Financeiro">
      <div className="flex flex-col gap-4">
        {/* Totais no topo — entrou (recebido), a receber (pendente), saiu
            (equipe) e o RESULTADO (recebido − saídas). Central de entradas E
            saídas (DL-061). */}
        {(() => {
          const received = data?.totalReceived ?? 0;
          const out = expenses?.total ?? 0;
          const result = received - out;
          return (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:max-w-3xl">
              <div className="rounded-lg border border-l-4 border-border border-l-status-confirmed bg-card p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recebido</div>
                <div className="mt-1 text-lg font-semibold text-status-confirmed">{brl(received)}</div>
              </div>
              <div className="rounded-lg border border-l-4 border-border border-l-status-pending bg-card p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pendente</div>
                <div className="mt-1 text-lg font-semibold text-status-pending">{brl(data?.totalPending ?? 0)}</div>
              </div>
              <div className="rounded-lg border border-l-4 border-border border-l-status-cancelled bg-card p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saídas (equipe)</div>
                <div className="mt-1 text-lg font-semibold text-status-cancelled">{brl(out)}</div>
              </div>
              <div className="rounded-lg border border-l-4 border-border border-l-primary bg-card p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resultado</div>
                <div className={cn("mt-1 text-lg font-semibold", result < 0 ? "text-status-cancelled" : "text-foreground")}>
                  {brl(result)}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Período por De/Até (Dia/Semana/Mês removidos — o filtro de data resolve) */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">De</span>
            <input
              type="date"
              aria-label="De"
              className={controlCls}
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Até</span>
            <input
              type="date"
              aria-label="Até"
              className={controlCls}
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>

        {/* Situação + Forma (esquerda) + Exportar CSV (direita). O botão abre um
            modal de confirmação (Story 5.4). */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Situação</span>
            <select
              aria-label="Situação"
              className={controlCls}
              value={statusF}
              onChange={(e) => setStatusF(e.target.value as typeof statusF)}
            >
              <option value="all">Todos</option>
              <option value="pago">Pagos</option>
              <option value="pendente">Pendentes</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Forma</span>
            <select
              aria-label="Forma de pagamento"
              className={controlCls}
              value={methodF}
              onChange={(e) => setMethodF(e.target.value as typeof methodF)}
            >
              <option value="all">Todas</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            className="ml-auto"
            onClick={() => setExportOpen(true)}
            disabled={filtered.length === 0}
          >
            <Download className="size-4" /> Exportar CSV
          </Button>
        </div>

        {/* Cliente por BUSCA (nome/telefone), abaixo de situação/forma — mesmo
            padrão do Novo agendamento (autocomplete). */}
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <span className="text-sm text-muted-foreground">Cliente</span>
          {selectedClient ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="truncate">
                {selectedClient.name}
                {selectedClient.phone_whatsapp ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {selectedClient.phone_whatsapp}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSelectedClient(null);
                  setClientQuery("");
                }}
              >
                limpar
              </button>
            </div>
          ) : (
            <>
              <Input
                aria-label="Cliente"
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
                        onClick={() => {
                          setSelectedClient(c);
                          setClientResults([]);
                        }}
                      >
                        {c.name}
                        {c.phone_whatsapp ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {c.phone_whatsapp}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Lista agrupada por data */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : errorKind ? (
          <ErrorState kind={errorKind} resource="os recebimentos" onRetry={() => void load()} />
        ) : groups.length > 0 ? (
          <div className="flex flex-col gap-4">
            {groups.map(([date, items]) => (
              <section key={date} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {brDate(date)}
                </h3>
                <ul className="flex flex-col gap-2">
                  {items.map((r) => (
                    <li key={r.appointmentId}>
                      {/* Card = editar pagamento (fechar caixa). O NOME, dentro
                          dele, é um link à parte → perfil da cliente (histórico +
                          o que mais está em aberto). Por isso o container é
                          div[role=button] (não dá para aninhar botão em botão). */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setEditing(r)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setEditing(r);
                          }
                        }}
                        aria-label={`Editar pagamento de ${r.clientName} — ${r.serviceName}`}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-l-4 border-border bg-card p-3 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring",
                          r.status === "pago"
                            ? "border-l-status-confirmed"
                            : "border-l-status-pending",
                        )}
                      >
                        <div className="min-w-0">
                          {r.clientId ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation(); // não abre o pagamento
                                navigate(`/clientes/${r.clientId}`);
                              }}
                              className="flex max-w-full items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary hover:underline"
                            >
                              <span className="truncate">{r.clientName}</span>
                              <Users className="size-3.5 shrink-0 opacity-60" />
                            </button>
                          ) : (
                            <div className="truncate text-sm font-medium text-foreground">
                              {r.clientName}
                            </div>
                          )}
                          <div className="truncate text-xs text-muted-foreground">
                            {r.serviceName}
                            {r.method ? ` · ${METHOD_LABEL[r.method]}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end">
                          <span className="text-sm font-semibold tabular-nums text-foreground">
                            {brl(r.amount)}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] font-medium",
                              r.status === "pago"
                                ? "text-status-confirmed"
                                : "text-status-pending",
                            )}
                          >
                            {r.status === "pago" ? "Pago" : "Pendente"}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum recebimento no período"
            description="Registre pagamentos abrindo um agendamento na Agenda."
          />
        )}

        {/* SAÍDAS — pagamentos à equipe (Story 5.10). O registro é do Dono. */}
        <section className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Saídas — pagamentos à equipe
            </h2>
            {isOwner && (
              <Button type="button" variant="secondary" onClick={() => setPayOpen(true)}>
                <Wallet className="size-4" /> Pagar à equipe
              </Button>
            )}
          </div>
          {!expenses?.payments?.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma saída no período.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {expenses.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-l-4 border-border border-l-status-cancelled bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {p.professionalName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      Pago em {brDate(p.paidOn)} · ref. {brDate(p.periodFrom)}–{brDate(p.periodTo)}
                      {p.note ? ` · ${p.note}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-status-cancelled">
                    − {brl(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Editar/receber o pagamento a partir do Financeiro (DL-065): o MESMO
          PaymentForm do agendamento, num dialog. Fecha o caixa sem ir à Agenda. */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Pagamento</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {/* Nome → perfil da cliente: ao receber, dá para ir direto ver o
                    histórico e o que mais está em aberto (DL-066). */}
                {editing.clientId ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/clientes/${editing.clientId}`)}
                    className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {editing.clientName}
                    <Users className="size-3.5 opacity-60" />
                  </button>
                ) : (
                  <span className="font-medium text-foreground">
                    {editing.clientName}
                  </span>
                )}{" "}
                · {editing.serviceName} · {brDate(editing.date)}
              </p>
              <PaymentForm
                appointmentId={editing.appointmentId}
                initialPayment={{
                  amount: editing.amount,
                  method: editing.method,
                  status: editing.status,
                }}
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  void load(); // recarrega os recebimentos do período
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação de exportação (Story 5.4): não baixa direto — modal central
          com Exportar/Cancelar. Exporta os recebimentos com os filtros aplicados. */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar recebimentos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {filtered.length === 1
              ? "1 recebimento"
              : `${filtered.length} recebimentos`}{" "}
            de {brDate(from)} a {brDate(to)}
            {statusF !== "all" || methodF !== "all" || selectedClient !== null
              ? " (com os filtros aplicados)"
              : ""}{" "}
            serão baixados em CSV.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setExportOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={exportCsv}>
              <Download className="size-4" /> Exportar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registrar SAÍDA — pagamento à equipe (Story 5.10, owner). */}
      {payOpen && (
        <RegistrarSaidaDialog
          from={from}
          to={to}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false);
            void load();
          }}
        />
      )}
    </PageLayout>
  );
}
