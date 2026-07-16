import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { apiRequest } from "../lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

const ACCESS_KEY = "tamarcado.access";
const NEW = "__new__";

interface ServiceDto {
  id: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  isActive: boolean;
}

interface Attender {
  id: string;
  name: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const token = () => localStorage.getItem(ACCESS_KEY);

/** Só dígitos (para as máscaras de duração e preço). */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Centavos (string de dígitos) → "80,50" para exibir no input de preço. */
function centsToInput(digits: string): string {
  if (digits === "") return "";
  return (Number(digits) / 100).toFixed(2).replace(".", ",");
}

/** Preço numérico (ex.: 80.5) → dígitos de centavos ("8050") para prefill. */
function priceToCents(price: number | null): string {
  if (price == null) return "";
  return String(Math.round(price * 100));
}

function formatDuration(min: number): string {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function formatPrice(price: number | null): string {
  if (price == null) return "sem preço";
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

/** Configurações → Serviços (owner-only no backend). Master-detail + vínculo. */
export function ConfiguracoesServicos() {
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [attenders, setAttenders] = useState<Attender[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Formulário. `duration`/`price` guardam SÓ DÍGITOS (price em centavos);
  // o valor enviado à API é o número puro, não o texto com máscara.
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [profIds, setProfIds] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState<string | null>(null);

  const isNew = selected === NEW;

  const loadServices = useCallback(async (): Promise<ServiceDto[]> => {
    const res = await apiRequest("/services", { token: token() });
    if (!res.ok) return [];
    const data = (await res.json()) as { services: ServiceDto[] };
    return data.services;
  }, []);

  // Carrega serviços + profissionais que atendem clientes.
  useEffect(() => {
    void (async () => {
      const [list, attRes] = await Promise.all([
        loadServices(),
        apiRequest("/users/attenders", { token: token() }),
      ]);
      setServices(list);
      if (attRes.ok) {
        const data = (await attRes.json()) as { users: Attender[] };
        setAttenders(data.users);
      }
      setSelected(list.length > 0 ? list[0].id : NEW);
    })();
  }, [loadServices]);

  // Preenche o formulário ao trocar a seleção.
  useEffect(() => {
    if (selected === null) return;
    setValidationError(null);
    if (selected === NEW) {
      setName("");
      setDuration("");
      setPrice("");
      setProfIds(new Set());
      return;
    }
    const svc = services.find((s) => s.id === selected);
    if (svc) {
      setName(svc.name);
      setDuration(String(svc.durationMinutes));
      setPrice(priceToCents(svc.price));
    }
    void apiRequest(`/services/${selected}/professionals`, { token: token() })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as { professionalIds: string[] };
          setProfIds(new Set(data.professionalIds));
        } else {
          setProfIds(new Set());
        }
      })
      .catch(() => setProfIds(new Set()));
  }, [selected, services]);

  function toggleProf(id: string): void {
    setProfIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();

    // Converte a máscara para os números puros que a API espera (snake_case,
    // duração INTEIRA, preço DECIMAL ou null quando vazio — DL-030).
    const trimmedName = name.trim();
    const durationMinutes = duration === "" ? NaN : Number(duration);
    const priceValue = price === "" ? null : Number(price) / 100;

    // Validação client-side: mensagem clara em vez do "Erro ao salvar" genérico.
    if (trimmedName === "") {
      setValidationError("Informe o nome do serviço.");
      setStatus("idle");
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setValidationError("Informe uma duração em minutos maior que zero.");
      setStatus("idle");
      return;
    }
    setValidationError(null);
    setStatus("saving");

    const body: {
      name: string;
      duration_minutes: number;
      price: number | null;
    } = {
      name: trimmedName,
      duration_minutes: durationMinutes,
      price: priceValue,
    };

    try {
      let serviceId = isNew ? "" : (selected as string);
      if (isNew) {
        const res = await apiRequest("/services", {
          method: "POST",
          body,
          token: token(),
        });
        if (!res.ok) throw new Error("create");
        serviceId = ((await res.json()) as ServiceDto).id;
      } else {
        const res = await apiRequest(`/services/${serviceId}`, {
          method: "PATCH",
          body,
          token: token(),
        });
        if (!res.ok) throw new Error("update");
      }

      // Sincroniza o vínculo profissional↔serviço (PUT substitui o conjunto).
      const profRes = await apiRequest(`/services/${serviceId}/professionals`, {
        method: "PUT",
        body: { professionalIds: [...profIds] },
        token: token(),
      });
      if (!profRes.ok) throw new Error("professionals");

      const list = await loadServices();
      setServices(list);
      setSelected(serviceId);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      {/* Lista */}
      <Card className="w-full md:w-72 md:shrink-0">
        <CardContent className="flex flex-col gap-2 p-4">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center"
            onClick={() => {
              setSelected(NEW);
              setStatus("idle");
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Novo serviço
          </Button>
          <ul className="flex flex-col">
            {services.map((svc) => {
              const active = svc.id === selected;
              return (
                <li key={svc.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(svc.id);
                      setStatus("idle");
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md border-l-2 px-3 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-muted"
                        : "border-transparent hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm text-foreground",
                        active && "font-semibold",
                      )}
                    >
                      {svc.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[formatDuration(svc.durationMinutes), formatPrice(svc.price)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Formulário */}
      <Card className="w-full">
        <CardContent className="p-6">
          <form onSubmit={(e) => void save(e)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="svc-name">Nome do serviço</Label>
              <Input
                id="svc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="svc-duration">Duração (min)</Label>
                <Input
                  id="svc-duration"
                  inputMode="numeric"
                  placeholder="0"
                  value={duration}
                  onChange={(e) => setDuration(onlyDigits(e.target.value))}
                />
                <span className="min-h-4 text-xs text-muted-foreground">
                  {formatDuration(Number(duration))}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="svc-price">
                  Preço{" "}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                  >
                    R$
                  </span>
                  <Input
                    id="svc-price"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="pl-9"
                    value={centsToInput(price)}
                    onChange={(e) => setPrice(onlyDigits(e.target.value))}
                  />
                </div>
                <span className="min-h-4 text-xs text-muted-foreground">
                  {price === "" ? "Sem preço" : ""}
                </span>
              </div>
            </div>

            {/* Seção secundária: vínculo profissional↔serviço */}
            <div className="flex flex-col gap-3 border-t border-border pt-5">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-muted-foreground">
                  Profissionais que fazem este serviço
                </span>
                <span className="text-xs text-muted-foreground">
                  Opcional — em branco vale para toda a equipe.
                </span>
              </div>
              {attenders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum profissional que atende clientes cadastrado.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {attenders.map((att) => {
                    const on = profIds.has(att.id);
                    return (
                      <button
                        key={att.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleProf(att.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                          on
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {on && <Check className="size-3.5" aria-hidden="true" />}
                        {att.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={status === "saving"}>
                {isNew ? "Salvar" : "Alterar"}
              </Button>
              {validationError && (
                <p role="alert" className="text-sm text-destructive">
                  {validationError}
                </p>
              )}
              {!validationError && status === "saved" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Serviço salvo.
                </p>
              )}
              {!validationError && status === "error" && (
                <p role="alert" className="text-sm text-destructive">
                  Erro ao salvar.
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
