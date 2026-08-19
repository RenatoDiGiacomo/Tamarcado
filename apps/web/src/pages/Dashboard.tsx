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

interface DashboardMetrics {
  received: number;
  pending: number;
  appointmentsCompleted: number;
  totalClients: number;
  avgClientsPerWeek: number;
}

type Preset = "dia" | "semana" | "mes";

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Faturamento por período (AC 5.6): hoje / semana corrente (seg–dom) / mês. */
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
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}

const brDate = (d: string) => d.split("-").reverse().join("/");

/**
 * Dashboard (Story 5.6) — SOMENTE LEITURA. Menu próprio, só para quem tem o
 * módulo (DL-062; gate no backend e na rota). Números do período: faturamento
 * (pago) + a receber (pendente), atendimentos concluídos, total de clientes e
 * média de clientes/semana. Exportar CSV reaproveita o `lib/csv.ts` da 5.4.
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
    const csv = toCsv(
      ["Métrica", "Valor"],
      [
        ["Período", `${brDate(range.from)} a ${brDate(range.to)}`],
        ["Faturamento (recebido)", csvAmount(data.received)],
        ["A receber (pendente)", csvAmount(data.pending)],
        ["Atendimentos concluídos", String(data.appointmentsCompleted)],
        ["Total de clientes", String(data.totalClients)],
        ["Média de clientes/semana", String(data.avgClientsPerWeek)],
      ],
    );
    downloadCsv(`dashboard_${range.from}_a_${range.to}.csv`, csv);
    setExportOpen(false);
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "dia", label: "Dia" },
    { key: "semana", label: "Semana" },
    { key: "mes", label: "Mês" },
  ];

  return (
    <PageLayout title="Dashboard">
      <div className="flex flex-col gap-4">
        {/* Período (dia/semana/mês) + Exportar CSV */}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : errorKind ? (
          <ErrorState kind={errorKind} resource="o dashboard" onRetry={() => void load()} />
        ) : data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Faturamento"
              value={brl(data.received)}
              tone="confirmed"
              hint={`A receber: ${brl(data.pending)}`}
            />
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
          "mt-1 text-2xl font-semibold tabular-nums",
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
