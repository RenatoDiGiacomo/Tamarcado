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

  // Formulário (strings nos inputs; preço opcional).
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [profIds, setProfIds] = useState<Set<string>>(new Set());

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
      setPrice(svc.price == null ? "" : String(svc.price).replace(".", ","));
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
    setStatus("saving");
    const parsedPrice = price.trim() === "" ? null : Number(price.replace(",", "."));
    const body = {
      name: name.trim(),
      durationMinutes: Number(duration),
      price: parsedPrice,
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
                required
              />
            </div>

            <div className="flex flex-col gap-5 sm:flex-row">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="svc-duration">Duração (min)</Label>
                <Input
                  id="svc-duration"
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="svc-price">
                  Preço{" "}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="svc-price"
                  inputMode="decimal"
                  placeholder="—"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
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
                Salvar
              </Button>
              {status === "saved" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Serviço salvo.
                </p>
              )}
              {status === "error" && (
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
