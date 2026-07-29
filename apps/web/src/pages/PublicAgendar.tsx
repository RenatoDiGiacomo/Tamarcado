import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, Clock } from "lucide-react";
import { apiRequest } from "../lib/api";
import { hexToHslTriplet } from "../lib/theme";

interface PublicInstallation {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}
interface PublicService {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
}

type Status = "loading" | "ok" | "notfound";

/** Preço "50.00" → "R$ 50,00"; null → "Sob consulta" (DL-030). */
function formatPrice(price: string | null): string {
  if (price == null) return "Sob consulta";
  const n = Number(price);
  if (Number.isNaN(n)) return "Sob consulta";
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

/**
 * Página pública de agendamento por link (Story 5B.1). SEM login — o tenant é
 * resolvido pelo slug (`/agendar/:slug`). Mostra o branding do estabelecimento
 * (nome/logo/cor) e os serviços ativos. Texto NEUTRO (DL-048, serve qualquer
 * prestador com agenda) e mobile-first. Escolher horário e enviar é a 5B.2.
 */
export function PublicAgendar() {
  const { slug } = useParams<{ slug: string }>();
  const [inst, setInst] = useState<PublicInstallation | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      setStatus("loading");
      const instRes = await apiRequest(`/public/${slug}/installation`);
      if (!instRes.ok) {
        if (active) setStatus("notfound");
        return;
      }
      const installation = (await instRes.json()) as PublicInstallation;
      const svcRes = await apiRequest(`/public/${slug}/services`);
      const svc = svcRes.ok
        ? ((await svcRes.json()) as { services: PublicService[] }).services
        : [];
      if (!active) return;
      setInst(installation);
      setServices(svc);
      setStatus("ok");
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  // Aplica a cor primária do estabelecimento (acento), como o AppShell (DL-037).
  useEffect(() => {
    const triplet = inst?.primaryColor
      ? hexToHslTriplet(inst.primaryColor)
      : null;
    if (triplet) {
      const root = document.documentElement.style;
      root.setProperty("--primary", triplet);
      root.setProperty("--ring", triplet);
    }
  }, [inst?.primaryColor]);

  if (status === "loading") {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </Centered>
    );
  }
  if (status === "notfound") {
    return (
      <Centered>
        <div className="text-center">
          <CalendarClock className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Estabelecimento não encontrado</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confira o link com quem te enviou.
          </p>
        </div>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-8">
        {/* Cabeçalho branded */}
        <header className="flex flex-col items-center gap-3 text-center">
          {inst?.logoUrl ? (
            <img
              src={inst.logoUrl}
              alt={inst.name}
              className="h-14 max-w-[220px] object-contain"
            />
          ) : (
            <span className="text-xl font-semibold text-foreground">
              {inst?.name}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Agende seu horário
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha um serviço para começar.
            </p>
          </div>
        </header>

        {/* Serviços */}
        <main className="flex flex-col gap-3">
          {services.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
              Nenhum serviço disponível no momento.
            </p>
          ) : (
            services.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {s.durationMinutes} min
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-foreground">
                  {formatPrice(s.price)}
                </span>
              </button>
            ))
          )}
        </main>

        <footer className="mt-auto pt-4 text-center text-xs text-muted-foreground">
          Ao agendar, o estabelecimento confirma o seu horário.
        </footer>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      {children}
    </div>
  );
}
