import { useCallback, useEffect, useState } from "react";
import { authedRequest } from "../lib/session";
import { brl } from "../lib/currency";
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

interface Receipt {
  appointmentId: string;
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

/** Primeiro dia do mês corrente e hoje (YYYY-MM-DD) — período padrão. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return { from, to };
}

/**
 * Financeiro — Recebimentos (Stories 5.2/5.3). Menu próprio, só para quem tem o
 * módulo (DL-062; gate no backend e na rota). Lista os recebimentos de um
 * período com o total recebido (pago) e o total pendente. O REGISTRO do
 * pagamento acontece no agendamento (na Agenda).
 */
export function Financeiro() {
  const init = defaultRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
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

  const dateCls =
    "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <PageLayout title="Financeiro">
      <div className="flex flex-col gap-4">
        {/* Filtro por período */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">De</span>
            <input
              type="date"
              aria-label="De"
              className={dateCls}
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
              className={dateCls}
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>

        {/* Totais */}
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recebido
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {brl(data?.totalReceived ?? 0)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pendente
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {brl(data?.totalPending ?? 0)}
            </div>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : errorKind ? (
          <ErrorState kind={errorKind} resource="os recebimentos" onRetry={() => void load()} />
        ) : data && data.receipts.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {data.receipts.map((r) => (
              <li
                key={r.appointmentId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {r.clientName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.serviceName} · {r.date.split("-").reverse().join("/")}
                    {r.method ? ` · ${METHOD_LABEL[r.method]}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className="text-sm font-semibold text-foreground">
                    {brl(r.amount)}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      r.status === "pago"
                        ? "text-muted-foreground"
                        : "text-destructive"
                    }`}
                  >
                    {r.status === "pago" ? "Pago" : "Pendente"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
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
