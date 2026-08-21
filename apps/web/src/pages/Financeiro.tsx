import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Download, Wallet, SlidersHorizontal } from "lucide-react";
import { authedRequest } from "../lib/session";
import { useAuth } from "../auth/AuthContext";
import { useIsDesktop } from "../lib/useMediaQuery";
import { RegistrarSaidaDialog } from "@/components/financeiro/RegistrarSaidaDialog";
import { StatStrip, type StatItem } from "@/components/StatStrip";
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
 *
 * Mobile: os totais viram a faixa que rola para o lado (`StatStrip`); do filtro
 * fica visível só o PERÍODO — situação/forma/cliente vão para o sheet do botão
 * "Filtros", que mostra quantos estão ativos. Lado a lado os três não cabiam e o
 * campo da cliente aparecia cortado.
 */
export function Financeiro() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user?.accessLevel === "owner";
  const isDesktop = useIsDesktop();
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
  // Abas: as duas leituras do caixa (entrou / saiu) separadas (reorg UX, Sally).
  const [tab, setTab] = useState<"recebimentos" | "saidas">("recebimentos");
  // Sheet de filtros do CELULAR: situação/forma/cliente não cabem lado a lado
  // com o período (o campo da cliente ficava cortado em "Bu"). O período fica
  // fora — é o mais usado. No desktop o painel continua inteiro, sem sheet.
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  // Os quatro totais: entrou, a receber, saiu e o RESULTADO (recebido − saídas).
  // Central de entradas E saídas (DL-061). No PC é a grade de sempre; no celular
  // vira a faixa que rola para o lado (StatStrip).
  const totalReceived = data?.totalReceived ?? 0;
  const totalOut = expenses?.total ?? 0;
  const result = totalReceived - totalOut;
  const totais: StatItem[] = [
    {
      key: "recebido",
      label: "Recebido",
      value: brl(totalReceived),
      accentClass: "border-l-status-confirmed",
      valueClass: "text-status-confirmed",
    },
    {
      key: "pendente",
      label: "Pendente",
      value: brl(data?.totalPending ?? 0),
      accentClass: "border-l-status-pending",
      valueClass: "text-status-pending",
    },
    {
      key: "saidas",
      label: "Saídas (equipe)",
      value: brl(totalOut),
      accentClass: "border-l-status-cancelled",
      valueClass: "text-status-cancelled",
    },
    {
      key: "resultado",
      label: "Resultado",
      value: brl(result),
      valueClass: result < 0 ? "text-status-cancelled" : "text-foreground",
    },
  ];

  // Quantos filtros (fora o período) estão ativos — vira o número no botão
  // "Filtros" do celular, para o que está escondido no sheet não sumir.
  const activeFilters =
    (statusF !== "all" ? 1 : 0) +
    (methodF !== "all" ? 1 : 0) +
    (selectedClient !== null ? 1 : 0);

  function clearFilters(): void {
    setStatusF("all");
    setMethodF("all");
    setSelectedClient(null);
    setClientQuery("");
  }

  // Campos de filtro — os MESMOS elementos no painel do desktop e no sheet do
  // celular (nunca os dois na tela ao mesmo tempo); só muda o invólucro.
  const wrapData = isDesktop
    ? "flex flex-col gap-1 text-sm"
    : "flex min-w-0 flex-1 flex-col gap-1 text-sm";
  const campoDe = (
    <label className={wrapData}>
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
  );
  const campoAte = (
    <label className={wrapData}>
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
  );
  const campoSituacao = (
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
  );
  const campoForma = (
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
  );
  /**
   * Cliente por busca. `floating`: no painel do desktop a lista de resultados
   * FLUTUA sobre o conteúdo (absolute); dentro do sheet ela entra no fluxo — o
   * sheet rola e recorta o que passa da borda, então um dropdown absoluto
   * apareceria cortado.
   */
  const campoCliente = (floating: boolean) => (
    <div
      className={
        floating
          ? "flex flex-1 flex-col gap-1 text-sm sm:min-w-52"
          : "flex flex-col gap-1 text-sm"
      }
    >
      <span className="text-muted-foreground">Cliente</span>
      {selectedClient ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-input px-3 py-1.5 text-sm">
          <span className="truncate">
            {selectedClient.name}
            {selectedClient.phone_whatsapp ? (
              <span className="text-muted-foreground"> · {selectedClient.phone_whatsapp}</span>
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
        <div className={floating ? "relative" : undefined}>
          <Input
            aria-label="Cliente"
            placeholder="Buscar por nome ou telefone"
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
          />
          {clientResults.length > 0 && (
            <ul
              className={cn(
                "mt-1 w-full rounded-md border border-border bg-card",
                floating && "absolute z-10 shadow-md",
              )}
            >
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
                      <span className="text-muted-foreground"> · {c.phone_whatsapp}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

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
    <PageLayout
      title="Financeiro"
      action={
        <div className="flex gap-2">
          {/* No celular o rótulo não cabe ao lado de "Pagar à equipe" — vira só
              o ícone (o nome segue no aria-label). Ver Dashboard, mesmo padrão. */}
          <Button
            type="button"
            variant="secondary"
            size={isDesktop ? "default" : "icon"}
            aria-label={isDesktop ? undefined : "Exportar CSV"}
            onClick={() => setExportOpen(true)}
            disabled={filtered.length === 0}
          >
            <Download className="size-4" />
            {isDesktop ? " Exportar CSV" : null}
          </Button>
          {isOwner && (
            <Button type="button" onClick={() => setPayOpen(true)}>
              <Wallet className="size-4" /> Pagar à equipe
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Totais no topo — entrou (recebido), a receber (pendente), saiu
            (equipe) e o RESULTADO (recebido − saídas). Central de entradas E
            saídas (DL-061). */}
        <StatStrip
          items={totais}
          label="Totais do período"
          gridClassName="md:grid-cols-2 lg:grid-cols-4 lg:max-w-3xl"
        />

        {/* Filtros. DESKTOP: painel único (reorg UX, Sally) — período sempre;
            situação/forma/cliente só na aba Recebimentos (não se aplicam às
            saídas). CELULAR: três filtros lado a lado não cabem — ficam só De/Até
            (o mais usado) e o resto vai para o sheet do botão "Filtros". */}
        {isDesktop ? (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
            {campoDe}
            {campoAte}
            {tab === "recebimentos" && (
              <>
                {campoSituacao}
                {campoForma}
                {campoCliente(true)}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-end gap-2">
              {campoDe}
              {campoAte}
            </div>
            {tab === "recebimentos" && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                aria-label={
                  activeFilters === 0
                    ? "Filtros"
                    : activeFilters === 1
                      ? "Filtros (1 ativo)"
                      : `Filtros (${activeFilters} ativos)`
                }
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="size-4" />
                Filtros
                {/* O número é o que impede o filtro escondido de ser esquecido. */}
                {activeFilters > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
                    {activeFilters}
                  </span>
                ) : null}
              </Button>
            )}
          </div>
        )}

        {/* Abas: as duas leituras do caixa (entrou / saiu) — reorg UX (Sally). */}
        <div role="tablist" aria-label="Entradas e saídas" className="flex gap-1 border-b border-border">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "recebimentos"}
            onClick={() => setTab("recebimentos")}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              tab === "recebimentos"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Recebimentos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "saidas"}
            onClick={() => setTab("saidas")}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              tab === "saidas"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Saídas
          </button>
        </div>

        {/* Aba Recebimentos (entradas), agrupada por data */}
        {tab === "recebimentos" &&
          (loading ? (
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
        ))}

        {/* Aba Saídas — pagamentos à equipe (Story 5.10). Registro no header (Dono). */}
        {tab === "saidas" &&
          (!expenses?.payments?.length ? (
            <EmptyState
              title="Nenhuma saída no período"
              description={
                isOwner
                  ? 'Registre um pagamento à equipe no botão "Pagar à equipe".'
                  : "Nenhum pagamento à equipe registrado."
              }
            />
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
          ))}
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

      {/* Filtros do CELULAR. Não é componente novo: o `DialogContent` já nasce
          bottom sheet abaixo de `md` e dialog central acima (ver ui/dialog.tsx).
          Só existe no mobile — no desktop os campos vivem no painel. */}
      {!isDesktop && (
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Filtros</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              {campoSituacao}
              {campoForma}
              {campoCliente(false)}
            </div>
            {/* O botão diz o resultado ANTES de fechar — a filtragem é na tela,
                então não há "aplicar": é só voltar para a lista já recortada. */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={clearFilters}
                disabled={activeFilters === 0}
              >
                Limpar
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => setFiltersOpen(false)}
              >
                {filtered.length === 0
                  ? "Nenhum recebimento"
                  : filtered.length === 1
                    ? "Ver 1 recebimento"
                    : `Ver ${filtered.length} recebimentos`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
