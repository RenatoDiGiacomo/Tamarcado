import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, Clock } from "lucide-react";
import { apiRequest } from "../lib/api";
import { hexToHslTriplet } from "../lib/theme";
import { cn } from "@/lib/utils";

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
interface PublicProfessional {
  id: string;
  name: string;
}
interface Slot {
  time: string;
}

type Status = "loading" | "form" | "success" | "notfound";

function formatPrice(price: string | null): string {
  if (price == null) return "Sob consulta";
  const n = Number(price);
  return Number.isNaN(n) ? "Sob consulta" : `R$ ${n.toFixed(2).replace(".", ",")}`;
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const m = body?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo */
  }
  return fallback;
}

const inputCls =
  "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Página pública de agendamento por link (Stories 5B.1/5B.2). SEM login — o
 * tenant vem do slug. Escolhe serviço/data/horário, informa nome + WhatsApp
 * (obrigatórios) e profissional (opcional), consente (LGPD) e envia; entra como
 * PENDENTE e o estabelecimento confirma. Texto NEUTRO (DL-048), mobile-first.
 */
export function PublicAgendar() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [inst, setInst] = useState<PublicInstallation | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessional[]>([]);

  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot (oculto)

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Branding + catálogo.
  useEffect(() => {
    let active = true;
    void (async () => {
      const instRes = await apiRequest(`/public/${slug}/installation`);
      if (!instRes.ok) {
        if (active) setStatus("notfound");
        return;
      }
      const installation = (await instRes.json()) as PublicInstallation;
      const [svcRes, profRes] = await Promise.all([
        apiRequest(`/public/${slug}/services`),
        apiRequest(`/public/${slug}/professionals`),
      ]);
      if (!active) return;
      setInst(installation);
      setServices(
        svcRes.ok
          ? (((await svcRes.json()) as { services?: PublicService[] }).services ?? [])
          : [],
      );
      setProfessionals(
        profRes.ok
          ? (((await profRes.json()) as { professionals?: PublicProfessional[] }).professionals ?? [])
          : [],
      );
      setStatus("form");
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const triplet = inst?.primaryColor ? hexToHslTriplet(inst.primaryColor) : null;
    if (triplet) {
      const root = document.documentElement.style;
      root.setProperty("--primary", triplet);
      root.setProperty("--ring", triplet);
    }
  }, [inst?.primaryColor]);

  // Horários livres (reusa o AvailabilityService no backend).
  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    let active = true;
    setLoadingSlots(true);
    void (async () => {
      const q = new URLSearchParams({ serviceId, date });
      if (professionalId) q.set("professionalId", professionalId);
      const res = await apiRequest(`/public/${slug}/availability?${q.toString()}`);
      if (!active) return;
      setSlots(res.ok ? ((await res.json()) as { slots: Slot[] }).slots : []);
      setTime("");
      setLoadingSlots(false);
    })();
    return () => {
      active = false;
    };
  }, [slug, serviceId, date, professionalId]);

  async function submit(): Promise<void> {
    setError(null);
    if (!serviceId) return setError("Escolha um serviço.");
    if (!time) return setError("Escolha um horário.");
    if (name.trim().length < 2) return setError("Informe seu nome.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Informe um WhatsApp válido.");
    if (!consent) return setError("É necessário aceitar o aviso de privacidade.");

    setSubmitting(true);
    try {
      const res = await apiRequest(`/public/${slug}/appointments`, {
        method: "POST",
        body: {
          name: name.trim(),
          phone: phone.replace(/\D/g, ""),
          serviceId,
          date,
          time,
          professionalId: professionalId || undefined,
          consent,
          website, // honeypot (vazio para humanos)
        },
      });
      if (!res.ok) {
        setError(await apiErrorMessage(res, "Não foi possível enviar. Tente novamente."));
        return;
      }
      setStatus("success");
    } catch {
      setError("Não foi possível enviar. Verifique sua conexão.");
    } finally {
      setSubmitting(false);
    }
  }

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
  if (status === "success") {
    return (
      <Centered>
        <div className="max-w-sm text-center">
          <CheckCircle2 className="mx-auto mb-4 size-14 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Recebido!</h1>
          <p className="mt-2 text-muted-foreground">
            O estabelecimento vai confirmar o seu horário.
          </p>
        </div>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-8">
        <header className="flex flex-col items-center gap-3 text-center">
          {inst?.logoUrl ? (
            <img
              src={inst.logoUrl}
              alt={inst.name}
              className="h-14 max-w-[220px] object-contain"
            />
          ) : (
            <span className="text-xl font-semibold text-foreground">{inst?.name}</span>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Agende seu horário
          </h1>
        </header>

        <div className="flex flex-col gap-5">
          <Field label="Serviço">
            <div className="flex flex-col gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
                    serviceId === s.id
                      ? "border-primary ring-1 ring-primary"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" /> {s.durationMinutes} min
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">
                    {formatPrice(s.price)}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {serviceId && (
            <>
              <Field label="Data">
                <input
                  type="date"
                  min={todayIso()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={cn(inputCls, "w-48")}
                />
              </Field>

              <Field label="Horário">
                {loadingSlots ? (
                  <p className="text-sm text-muted-foreground">Buscando horários…</p>
                ) : slots.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.time}
                        type="button"
                        onClick={() => setTime(s.time)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-sm tabular-nums transition-colors",
                          time === s.time
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        {s.time}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem horários livres neste dia. Tente outra data.
                  </p>
                )}
              </Field>

              {professionals.length > 0 && (
                <Field label="Profissional (opcional)">
                  <select
                    value={professionalId}
                    onChange={(e) => setProfessionalId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Sem preferência</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Seu nome">
                <input
                  aria-label="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome e sobrenome"
                  className={inputCls}
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  aria-label="WhatsApp"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="(11) 99999-8888"
                  className={inputCls}
                />
              </Field>

              {/* Honeypot — oculto para humanos, atrai bots. */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                aria-hidden="true"
              />

              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  Concordo que o estabelecimento guarde meu nome e WhatsApp para gerenciar
                  este atendimento.
                </span>
              </label>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="h-11 rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Enviando…" : "Agendar"}
              </button>
            </>
          )}
        </div>

        <footer className="mt-auto pt-4 text-center text-xs text-muted-foreground">
          Ao agendar, o estabelecimento confirma o seu horário.
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
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
