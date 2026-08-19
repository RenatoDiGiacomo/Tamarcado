import { useCallback, useEffect, useMemo, useState } from "react";
import { authedRequest } from "../lib/session";
import { brl } from "../lib/currency";
import { cn } from "@/lib/utils";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import {
  ErrorState,
  errorKindFrom,
  type ErrorKind,
} from "@/components/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";

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

type Preset = "dia" | "semana" | "mes" | "custom";

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Intervalo para os atalhos: hoje / semana corrente (seg–dom) / mês corrente. */
function rangeFor(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const now = new Date();
  if (preset === "dia") {
    const s = ymd(now);
    return { from: s, to: s };
  }
  if (preset === "semana") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // volta até segunda
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: ymd(mon), to: ymd(sun) };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}

const controlCls =
  "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";
const brDate = (d: string) => d.split("-").reverse().join("/");

/**
 * Financeiro — Recebimentos (Stories 5.2/5.3/5.5). Menu próprio, só para quem tem
 * o módulo (DL-062; gate no backend e na rota). Central de ENTRADAS: recebimentos
 * do período com total recebido/pendente. Filtros: atalhos de período + De/Até,
 * situação, forma e cliente. O REGISTRO do pagamento acontece no agendamento.
 */
export function Financeiro() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [from, setFrom] = useState(rangeFor("mes").from);
  const [to, setTo] = useState(rangeFor("mes").to);
  const [statusF, setStatusF] = useState<"all" | "pago" | "pendente">("all");
  const [methodF, setMethodF] = useState<"all" | PaymentMethod>("all");
  const [clientF, setClientF] = useState<string>("all");
  const [data, setData] = useState<ReceiptsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    try {
      const res = await authedRequest(
        `/appointments/payments?from=${from}&to=${to}`,
      );
      if (!res.ok) {
        setErrorKind("server");
        setData(null);
        return;
      }
      setData((await res.json()) as ReceiptsData);
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

  function applyPreset(p: Exclude<Preset, "custom">): void {
    const r = rangeFor(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
  }

  // Filtros de situação/forma/cliente aplicados no cliente (o período já é a
  // consulta). Clientes disponíveis = os presentes no período.
  const clientOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.receipts ?? []) if (r.clientId) m.set(r.clientId, r.clientName);
    return [...m.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = useMemo(
    () =>
      (data?.receipts ?? []).filter(
        (r) =>
          (statusF === "all" || r.status === statusF) &&
          (methodF === "all" || r.method === methodF) &&
          (clientF === "all" || r.clientId === clientF),
      ),
    [data, statusF, methodF, clientF],
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

  const presets: { key: Exclude<Preset, "custom">; label: string }[] = [
    { key: "dia", label: "Dia" },
    { key: "semana", label: "Semana" },
    { key: "mes", label: "Mês" },
  ];

  return (
    <PageLayout title="Financeiro">
      <div className="flex flex-col gap-4">
        {/* Atalhos + período personalizado */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-input">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  preset === p.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">De</span>
            <input
              type="date"
              aria-label="De"
              className={controlCls}
              value={from}
              max={to}
              onChange={(e) => {
                setPreset("custom");
                setFrom(e.target.value);
              }}
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
              onChange={(e) => {
                setPreset("custom");
                setTo(e.target.value);
              }}
            />
          </label>
        </div>

        {/* Filtros: situação, forma, cliente */}
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Cliente</span>
            <select
              aria-label="Cliente"
              className={cn(controlCls, "max-w-52")}
              value={clientF}
              onChange={(e) => setClientF(e.target.value)}
            >
              <option value="all">Todas</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Totais — coloridos pelos tokens de status (verde=recebido, âmbar=pendente) */}
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-lg border border-l-4 border-border border-l-status-confirmed bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recebido
            </div>
            <div className="mt-1 text-lg font-semibold text-status-confirmed">
              {brl(data?.totalReceived ?? 0)}
            </div>
          </div>
          <div className="rounded-lg border border-l-4 border-border border-l-status-pending bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pendente
            </div>
            <div className="mt-1 text-lg font-semibold text-status-pending">
              {brl(data?.totalPending ?? 0)}
            </div>
          </div>
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
                    <li
                      key={r.appointmentId}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border border-l-4 border-border bg-card p-3",
                        r.status === "pago"
                          ? "border-l-status-confirmed"
                          : "border-l-status-pending",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {r.clientName}
                        </div>
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
      </div>
    </PageLayout>
  );
}
