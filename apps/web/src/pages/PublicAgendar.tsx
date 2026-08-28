import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, MapPin } from "lucide-react";
import { apiRequest } from "../lib/api";
import { hexToHslTriplet } from "../lib/theme";
import { cn } from "@/lib/utils";

interface PublicInstallation {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  address: string | null;
  mapsUrl: string | null;
  instagramUrl: string | null;
  /** Só dígitos, já normalizado pelo backend. */
  whatsappPhone: string | null;
}
interface PublicService {
  id: string;
  name: string;
  durationMinutes: number;
  price: string | null;
  description: string | null;
}
interface PublicProfessional {
  id: string;
  name: string;
}
interface Slot {
  time: string;
}

type Status = "loading" | "form" | "success" | "notfound";

/** Quantos dias a faixa oferece de uma vez. Duas semanas cobrem o "volto daqui
 *  a 15 dias" sem virar um calendário. */
const DIAS_NA_FAIXA = 14;

function formatPrice(price: string | null): string {
  if (price == null) return "Sob consulta";
  const n = Number(price);
  return Number.isNaN(n) ? "Sob consulta" : `R$ ${n.toFixed(2).replace(".", ",")}`;
}
function isoDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayIso(): string {
  return isoDe(new Date());
}

/** Iniciais para o card do profissional enquanto não há foto (2ª leva). */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** Só o primeiro nome no card — cabe em 5rem e é como a cliente chama a pessoa. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/**
 * Manhã / tarde / noite. Uma lista corrida de 12 horários é difícil de varrer no
 * celular; separada por período, a pessoa vai direto ao pedaço do dia que lhe
 * serve.
 */
const PERIODOS = [
  { nome: "Manhã", ate: 12 },
  { nome: "Tarde", ate: 18 },
  { nome: "Noite", ate: 24 },
] as const;

function agruparPorPeriodo(slots: Slot[]): { nome: string; slots: Slot[] }[] {
  return PERIODOS.map(({ nome, ate }, i) => {
    const de = i === 0 ? 0 : PERIODOS[i - 1].ate;
    return {
      nome,
      slots: slots.filter((s) => {
        const hora = Number(s.time.slice(0, 2));
        return hora >= de && hora < ate;
      }),
    };
  }).filter((p) => p.slots.length > 0);
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
 * Página pública de agendamento por link (Stories 5B.1/5B.2; redesenho da 1ª
 * leva, spec de UX de 2026-08-26). SEM login — o tenant vem do slug.
 *
 * Fluxo em etapas: **serviço → profissional → dia → horário → dados**. A ordem
 * importa: cada profissional tem disponibilidade própria, então escolher depois
 * obrigaria a recarregar os horários.
 *
 * Texto NEUTRO (DL-048), mobile-first. Foto de serviço e avatar do profissional
 * ficam para a 2ª leva (dependem de upload) — até lá, card compacto e iniciais.
 */
export function PublicAgendar() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [inst, setInst] = useState<PublicInstallation | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessional[]>([]);
  /** id → nome, para a mensagem de aviso citar quem foi escolhido. */
  const profNomeRef = useRef(new Map<string, string>());
  profNomeRef.current = new Map(professionals.map((p) => [p.id, p.name]));

  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [time, setTime] = useState("");
  /** Espelho do horário escolhido, para o efeito de disponibilidade consultar
   *  SEM entrar nas dependências — senão escolher um horário recarregaria os
   *  horários, que é justamente o que se quer evitar. */
  const timeRef = useRef("");
  timeRef.current = time;
  /** Aviso (não erro) quando o horário escolhido deixa de estar disponível. */
  const [slotAviso, setSlotAviso] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot (oculto)

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Faixa de dias a partir de hoje. Recalcula só quando o componente monta —
   *  ninguém deixa a página aberta virando o dia. */
  const dias = useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: DIAS_NA_FAIXA }, (_, i) => {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() + i);
      return {
        iso: isoDe(d),
        semana: i === 0 ? "hoje" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        numero: d.getDate(),
        mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      };
    });
  }, []);

  const servicoEscolhido = services.find((s) => s.id === serviceId) ?? null;
  const diaEscolhido = dias.find((d) => d.iso === date) ?? null;
  const periodos = agruparPorPeriodo(slots);

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
      const novos = res.ok ? ((await res.json()) as { slots: Slot[] }).slots : [];
      setSlots(novos);

      // A seleção de horário NÃO é descartada por padrão. Antes, qualquer
      // mudança (inclusive escolher a profissional) zerava o horário e a
      // cliente tinha de escolher de novo, sem entender por quê.
      const escolhido = timeRef.current;
      if (escolhido && !novos.some((s) => s.time === escolhido)) {
        // Sumiu de verdade: avisa, com o motivo, em vez de apagar em silêncio.
        const comQuem = professionalId
          ? profNomeRef.current.get(professionalId)
          : null;
        setSlotAviso(
          comQuem
            ? `O horário das ${escolhido} não está livre com ${comQuem}. Escolha outro abaixo.`
            : `O horário das ${escolhido} não está livre nesta data. Escolha outro abaixo.`,
        );
        setTime("");
      } else if (escolhido) {
        // Continua livre: mantém a escolha e limpa qualquer aviso antigo.
        setSlotAviso(null);
      }
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
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
        {/* ── Capa: identidade, ONDE FICA e onde ver o trabalho ──────────────
            O endereço vem aqui e não no rodapé: quem nunca foi procura isso
            ANTES de escolher o serviço (decisão da spec de UX). */}
        <header className="flex flex-col items-center gap-3 border-b border-border px-4 py-6 text-center">
          {inst?.logoUrl ? (
            <img
              src={inst.logoUrl}
              alt={inst.name}
              className="h-14 max-w-[220px] object-contain"
            />
          ) : (
            <span className="text-xl font-semibold text-foreground">{inst?.name}</span>
          )}

          {inst?.address && (
            <p className="text-sm text-muted-foreground">
              {inst.address}
              {inst.mapsUrl && (
                <a
                  href={inst.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1.5 inline-flex min-h-11 items-center gap-1 align-middle font-semibold text-primary"
                >
                  <MapPin className="size-4" aria-hidden="true" />
                  Como chegar
                </a>
              )}
            </p>
          )}

          {(inst?.instagramUrl || inst?.whatsappPhone) && (
            <div className="flex gap-2">
              {inst?.instagramUrl && (
                <a
                  href={inst.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Instagram de ${inst.name}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <IconeInstagram />
                  Instagram
                </a>
              )}
              {inst?.whatsappPhone && (
                <a
                  href={`https://wa.me/${inst.whatsappPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp de ${inst.name}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <IconeWhatsapp />
                  WhatsApp
                </a>
              )}
            </div>
          )}
        </header>

        <div className="flex flex-col gap-7 px-4 py-6">
          <h1 className="sr-only">Agende seu horário</h1>

          {/* 1 · Serviço */}
          <Etapa numero={1} titulo="Escolha o serviço">
            <div className="flex flex-col gap-2.5">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={serviceId === s.id}
                  onClick={() => setServiceId(s.id)}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-colors",
                    serviceId === s.id
                      ? "border-primary ring-1 ring-primary"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatPrice(s.price)}
                    </span>
                  </span>
                  {s.description && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {s.durationMinutes} min
                  </span>
                </button>
              ))}
            </div>
          </Etapa>

          {serviceId && (
            <>
              {/* 2 · Profissional — em cards, não escondido num campo opcional.
                  Escolher quem atende é o que o concorrente não oferece. */}
              {professionals.length > 0 && (
                <Etapa
                  numero={2}
                  titulo="Com quem você quer ser atendida?"
                  dica="Sem preferência mostra os horários de quem estiver livre."
                >
                  <div
                    role="group"
                    aria-label="Profissional"
                    className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [overscroll-behavior-x:contain]"
                  >
                    <CardProfissional
                      nome="Sem preferência"
                      sigla="✳"
                      escolhido={professionalId === ""}
                      onClick={() => setProfessionalId("")}
                    />
                    {professionals.map((p) => (
                      <CardProfissional
                        key={p.id}
                        nome={primeiroNome(p.name)}
                        nomeCompleto={p.name}
                        sigla={iniciais(p.name)}
                        escolhido={professionalId === p.id}
                        onClick={() => setProfessionalId(p.id)}
                      />
                    ))}
                  </div>
                </Etapa>
              )}

              {/* 3 · Dia — faixa rolável, não seletor de calendário. */}
              <Etapa numero={professionals.length > 0 ? 3 : 2} titulo="Escolha o dia">
                <div
                  role="group"
                  aria-label="Dia"
                  className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [overscroll-behavior-x:contain]"
                >
                  {dias.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      aria-pressed={date === d.iso}
                      aria-label={`${d.numero} de ${d.mes}`}
                      onClick={() => setDate(d.iso)}
                      className={cn(
                        "flex min-w-14 flex-col items-center rounded-lg border px-1 py-2 transition-colors",
                        date === d.iso
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary/60",
                      )}
                    >
                      <span className="text-[11px] uppercase tracking-wide opacity-75">
                        {d.semana}
                      </span>
                      <span className="text-lg font-bold tabular-nums leading-tight">
                        {d.numero}
                      </span>
                    </button>
                  ))}
                </div>
              </Etapa>

              {/* 4 · Horário — agrupado por período. */}
              <Etapa numero={professionals.length > 0 ? 4 : 3} titulo="Escolha o horário">
                {loadingSlots ? (
                  <p className="text-sm text-muted-foreground">Buscando horários…</p>
                ) : periodos.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {periodos.map((p) => (
                      <div key={p.nome} className="flex flex-col gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {p.nome}
                        </span>
                        <div
                          role="group"
                          aria-label={`Horários da ${p.nome.toLowerCase()}`}
                          className="grid grid-cols-4 gap-2"
                        >
                          {p.slots.map((s) => (
                            <button
                              key={s.time}
                              type="button"
                              aria-pressed={time === s.time}
                              onClick={() => {
                                setTime(s.time);
                                setSlotAviso(null);
                              }}
                              className={cn(
                                "min-h-11 rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                                time === s.time
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card hover:bg-accent",
                              )}
                            >
                              {s.time}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem horários livres neste dia. Escolha outro dia acima.
                  </p>
                )}
                {slotAviso && (
                  <p
                    role="status"
                    className="mt-2 rounded-md bg-status-pending/10 px-3 py-2 text-sm text-foreground"
                  >
                    {slotAviso}
                  </p>
                )}
              </Etapa>

              {/* 5 · Dados, com o resumo do que foi escolhido logo acima. */}
              <Etapa numero={professionals.length > 0 ? 5 : 4} titulo="Seus dados">
                <div
                  role="group"
                  aria-label="Resumo do agendamento"
                  aria-live="polite"
                  className="flex flex-col gap-1 rounded-lg border border-dashed border-border bg-muted/40 px-3.5 py-3 text-sm"
                >
                  {servicoEscolhido && time ? (
                    <>
                      <LinhaResumo rotulo="Serviço" valor={servicoEscolhido.name} />
                      <LinhaResumo
                        rotulo="Com"
                        valor={
                          professionalId
                            ? (profNomeRef.current.get(professionalId) ?? "Sem preferência")
                            : "Sem preferência"
                        }
                      />
                      <LinhaResumo
                        rotulo="Quando"
                        valor={`${diaEscolhido ? `${diaEscolhido.semana}, ${diaEscolhido.numero}/${diaEscolhido.mes}` : date} às ${time}`}
                      />
                      <LinhaResumo
                        rotulo="Valor"
                        valor={formatPrice(servicoEscolhido.price)}
                      />
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Escolha o serviço e o horário para ver o resumo aqui.
                    </span>
                  )}
                </div>

                <label className="mt-1 flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Seu nome</span>
                  <input
                    aria-label="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome e sobrenome"
                    autoComplete="name"
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">WhatsApp</span>
                  <input
                    aria-label="WhatsApp"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(11) 99999-8888"
                    className={inputCls}
                  />
                </label>

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
                  {/* O link para a política era pendência da 5B.2 (NFR-S2): o
                      aviso pedia consentimento sem lugar nenhum para ler o que
                      se estava aceitando. Aponta para a página da landing, em
                      outra origem — daí `noopener`, e nova aba para não perder
                      o formulário já preenchido. */}
                  <span>
                    Concordo que o estabelecimento guarde meu nome e WhatsApp para gerenciar
                    este atendimento. Veja a{" "}
                    <a
                      href="https://tamarcado.tec.br/politica-de-privacidade/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      Política de Privacidade
                    </a>
                    .
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
                  className="h-12 rounded-lg bg-primary font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? "Enviando…" : "Agendar"}
                </button>
              </Etapa>
            </>
          )}

          <footer className="pt-1 text-center text-xs text-muted-foreground">
            Ao agendar, o estabelecimento confirma o seu horário.
          </footer>
        </div>
      </div>
    </div>
  );
}

/* Logos de marca: o lucide 1.23 não tem `instagram` nem `facebook` (o projeto
   removeu ícones de marca), então vão inline, como na landing page. São
   PREENCHIDOS, ao contrário dos ícones traçados do lucide. */
function IconeInstagram() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true" focusable="false">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.06 1.17-.25 1.8-.42 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.86.07-3.21 0-3.59-.01-4.86-.07-1.17-.06-1.82-.26-2.24-.42-.57-.22-.96-.48-1.38-.9-.42-.42-.69-.82-.9-1.38-.16-.42-.36-1.06-.42-2.23-.04-1.26-.06-1.65-.06-4.84 0-3.2.02-3.59.06-4.86.06-1.17.26-1.81.42-2.23.21-.57.48-.96.9-1.38.42-.42.81-.69 1.38-.9.42-.17 1.05-.36 2.22-.42 1.28-.05 1.65-.06 4.86-.06zM12 0C8.74 0 8.33.02 7.05.07 5.78.13 4.9.33 4.14.63c-.79.31-1.46.72-2.13 1.38C1.35 2.68.94 3.35.63 4.14.33 4.9.13 5.78.07 7.05.02 8.33 0 8.74 0 12s.02 3.67.07 4.95c.06 1.28.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.67 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56 1.28.06 1.69.07 4.95.07s3.67-.02 4.95-.07c1.28-.06 2.15-.26 2.91-.56.79-.31 1.46-.72 2.13-1.38.67-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.02-3.67-.07-4.95c-.06-1.28-.26-2.15-.56-2.91-.31-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.94 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.02 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.85-10.41a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z" />
    </svg>
  );
}
function IconeWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true" focusable="false">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.7.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.08-.12-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.43 9.89-9.88 9.89m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42z" />
    </svg>
  );
}

/**
 * Etapa numerada. A numeração é informação, não enfeite: o agendamento é uma
 * sequência, e a ordem importa (a profissional escolhida filtra os horários).
 */
function Etapa({
  numero,
  titulo,
  dica,
  children,
}: {
  numero: number;
  titulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground"
        >
          {numero}
        </span>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {titulo}
        </h2>
      </div>
      {dica && <p className="-mt-1 text-xs text-muted-foreground">{dica}</p>}
      {children}
    </section>
  );
}

/** Card do profissional. A foto entra na 2ª leva; por ora, as iniciais. */
function CardProfissional({
  nome,
  nomeCompleto,
  sigla,
  escolhido,
  onClick,
}: {
  nome: string;
  nomeCompleto?: string;
  sigla: string;
  escolhido: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={escolhido}
      aria-label={nomeCompleto ?? nome}
      onClick={onClick}
      className={cn(
        "flex w-[5.25rem] shrink-0 flex-col items-center gap-1.5 rounded-lg border px-1 py-2.5 transition-colors",
        escolhido
          ? "border-primary ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/60",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-12 place-items-center rounded-full text-sm font-bold",
          escolhido
            ? "bg-primary text-primary-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        {sigla}
      </span>
      <span className="text-center text-xs font-semibold leading-tight text-foreground">
        {nome}
      </span>
    </button>
  );
}

function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="flex justify-between gap-4">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-semibold text-foreground">{valor}</span>
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      {children}
    </div>
  );
}
