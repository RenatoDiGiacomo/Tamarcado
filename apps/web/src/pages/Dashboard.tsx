import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { authedRequest } from "../lib/session";
import { brl } from "../lib/currency";
import { toCsv, csvAmount, downloadCsv } from "../lib/csv";
import { cn } from "@/lib/utils";
import { PageLayout } from "@/components/PageLayout";
import {
  ErrorState,
  errorKindFrom,
  type ErrorKind,
} from "@/components/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LineChart } from "@/components/charts/LineChart";
import { PieChart } from "@/components/charts/PieChart";
import { HBarChart } from "@/components/charts/HBarChart";

type ApptStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

interface DashboardMetrics {
  received: number;
  pending: number;
  salesCount: number;
  averageTicket: number;
  appointmentsCompleted: number;
  totalClients: number;
  avgClientsPerWeek: number;
  revenueSeries: { label: string; value: number }[];
  statusBreakdown: { status: ApptStatus; count: number }[];
  topClients: { clientId: string; name: string; count: number }[];
}

type Preset = "dia" | "semana" | "mes" | "ano";

/** Status → rótulo + classes de cor LITERAIS (Tailwind JIT) da paleta de status. */
const STATUS_META: Record<
  ApptStatus,
  { label: string; fillClass: string; dotClass: string }
> = {
  completed: { label: "Concluído", fillClass: "fill-status-done", dotClass: "bg-status-done" },
  confirmed: { label: "Confirmado", fillClass: "fill-status-confirmed", dotClass: "bg-status-confirmed" },
  pending: { label: "Pendente", fillClass: "fill-status-pending", dotClass: "bg-status-pending" },
  cancelled: { label: "Cancelado", fillClass: "fill-status-cancelled", dotClass: "bg-status-cancelled" },
  no_show: { label: "Não compareceu", fillClass: "fill-status-noshow", dotClass: "bg-status-noshow" },
};
const STATUS_ORDER: ApptStatus[] = ["completed", "confirmed", "pending", "cancelled", "no_show"];

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Período dos atalhos: hoje / semana (seg–dom) / mês / ano corrente. */
function rangeFor(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "dia") {
    const s = ymd(now);
    return { from: s, to: s };
  }
  if (preset === "semana") {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: ymd(mon), to: ymd(sun) };
  }
  if (preset === "ano") {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}

const brDate = (d: string) => d.split("-").reverse().join("/");

/**
 * Dashboard (Story 5.6) — SOMENTE LEITURA. Menu próprio e página inicial (só para
 * quem tem o módulo; DL-062). KPIs (valor bruto, vendas, ticket médio, atendimentos,
 * clientes) + gráficos: LINHA (faturamento no tempo), PIZZA (atendimentos por
 * status), BARRAS (top clientes por frequência). Período dia/semana/mês/ano.
 * Exportar CSV reaproveita o `lib/csv.ts` (5.4). Mobile: tudo empilha.
 */
export function Dashboard() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [range, setRange] = useState(() => rangeFor("mes"));
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKind(null);
    try {
      const res = await authedRequest(
        `/dashboard?from=${range.from}&to=${range.to}`,
      );
      if (!res.ok) {
        setErrorKind("server");
        setData(null);
        return;
      }
      setData((await res.json()) as DashboardMetrics);
    } catch (e) {
      setErrorKind(errorKindFrom(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPreset(p: Preset): void {
    setPreset(p);
    setRange(rangeFor(p));
  }

  function exportCsv(): void {
    if (!data) return;
    const rows: (string | number)[][] = [
      ["Período", `${brDate(range.from)} a ${brDate(range.to)}`],
      ["Valor bruto (recebido)", csvAmount(data.received)],
      ["A receber (pendente)", csvAmount(data.pending)],
      ["Vendas", String(data.salesCount)],
      ["Ticket médio", csvAmount(data.averageTicket)],
      ["Atendimentos concluídos", String(data.appointmentsCompleted)],
      ["Total de clientes", String(data.totalClients)],
      ["Média de clientes/semana", String(data.avgClientsPerWeek)],
    ];
    for (const [i, c] of data.topClients.entries()) {
      rows.push([`Top cliente ${i + 1}`, `${c.name} (${c.count})`]);
    }
    downloadCsv(
      `dashboard_${range.from}_a_${range.to}.csv`,
      toCsv(["Métrica", "Valor"], rows),
    );
    setExportOpen(false);
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "dia", label: "Dia" },
    { key: "semana", label: "Semana" },
    { key: "mes", label: "Mês" },
    { key: "ano", label: "Ano" },
  ];

  const pieSegments = data
    ? STATUS_ORDER.map((s) => ({
        status: s,
        count: data.statusBreakdown.find((x) => x.status === s)?.count ?? 0,
      }))
        .filter((x) => x.count > 0)
        .map((x) => ({
          label: STATUS_META[x.status].label,
          value: x.count,
          fillClass: STATUS_META[x.status].fillClass,
          dotClass: STATUS_META[x.status].dotClass,
        }))
    : [];

  return (
    <PageLayout title="Dashboard">
      <div className="flex flex-col gap-4">
        {/* Período (dia/semana/mês/ano) + Exportar CSV */}
        <div className="flex flex-wrap items-center gap-3">
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
          <span className="text-sm text-muted-foreground">
            {brDate(range.from)} a {brDate(range.to)}
          </span>
          <Button
            type="button"
            variant="secondary"
            className="ml-auto"
            onClick={() => setExportOpen(true)}
            disabled={!data}
          >
            <Download className="size-4" /> Exportar CSV
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
            <Skeleton className="h-56 w-full" />
          </div>
        ) : errorKind ? (
          <ErrorState kind={errorKind} resource="o dashboard" onRetry={() => void load()} />
        ) : data ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi
                label="Valor bruto"
                value={brl(data.received)}
                tone="confirmed"
                hint={`A receber: ${brl(data.pending)}`}
              />
              <Kpi label="Vendas" value={String(data.salesCount)} />
              <Kpi label="Ticket médio" value={brl(data.averageTicket)} />
              <Kpi
                label="Atendimentos concluídos"
                value={String(data.appointmentsCompleted)}
              />
              <Kpi label="Clientes cadastradas" value={String(data.totalClients)} />
              <Kpi
                label="Clientes/semana (média)"
                value={String(data.avgClientsPerWeek)}
              />
            </div>

            {/* Linha: faturamento no tempo */}
            <ChartCard title="Faturamento no período">
              <LineChart data={data.revenueSeries} formatValue={brl} />
            </ChartCard>

            {/* Pizza + Barras */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Atendimentos por status">
                <PieChart segments={pieSegments} />
              </ChartCard>
              <ChartCard title="Clientes com maior frequência (top 5)">
                <HBarChart
                  items={data.topClients.map((c) => ({ label: c.name, value: c.count }))}
                />
              </ChartCard>
            </div>
          </>
        ) : null}
      </div>

      {/* Confirmação de exportação (reusa o padrão da 5.4). */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar dashboard</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Os números de {brDate(range.from)} a {brDate(range.to)} serão baixados
            em CSV.
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
    </PageLayout>
  );
}

/** Cartão de indicador (KPI) — rótulo + valor grande; tom opcional de status. */
function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "confirmed";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-l-4 border-border bg-card p-4",
        tone === "confirmed" ? "border-l-status-confirmed" : "border-l-primary",
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "confirmed" ? "text-status-confirmed" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/** Cartão de gráfico — título + conteúdo. */
function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}
