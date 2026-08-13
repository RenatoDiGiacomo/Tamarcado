import { useEffect, useState, type FormEvent } from "react";
import { authedRequest } from "../lib/session";
import { refreshInstallation } from "../lib/useInstallation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";


type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Presets de cor primária (tons terrosos) — clicar preenche o hex. */
const PRESETS: { hex: string; name: string }[] = [
  { hex: "#B85C38", name: "Terracota" },
  { hex: "#B07D1F", name: "Mostarda" },
  { hex: "#6B7A3F", name: "Oliva" },
  { hex: "#A15A4A", name: "Argila" },
  { hex: "#6F4A34", name: "Café" },
];

/** Configurações → Identidade visual (owner-only no backend). Logo por URL (DL-034). */
export function ConfiguracoesIdentidade() {
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6c63ff");
  const [openTime, setOpenTime] = useState("08:00");
  const [closeTime, setCloseTime] = useState("19:00");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    authedRequest("/installation", {})
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as {
            name: string;
            logoUrl: string | null;
            primaryColor: string | null;
            businessHoursStart?: string;
            businessHoursEnd?: string;
          };
          setName(data.name ?? "");
          setLogoUrl(data.logoUrl ?? "");
          setPrimaryColor(data.primaryColor ?? "#6c63ff");
          setOpenTime(data.businessHoursStart ?? "08:00");
          setCloseTime(data.businessHoursEnd ?? "19:00");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  const toMin = (t: string): number => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (toMin(closeTime) <= toMin(openTime)) {
      setValidationError("O horário de fechamento deve ser após a abertura.");
      setStatus("idle");
      return;
    }
    setValidationError(null);
    setStatus("saving");
    const body: Record<string, unknown> = {
      name,
      primaryColor,
      businessHoursStart: openTime,
      businessHoursEnd: closeTime,
    };
    if (logoUrl) {
      body.logoUrl = logoUrl;
    }
    const res = await authedRequest("/installation", {
      method: "PATCH",
      body,
    });
    setStatus(res.ok ? "saved" : "error");
    // Revalida o branding compartilhado → AppShell (cor/nome/logo) repinta na
    // hora, sem reload. Este era o bug: a prévia (estado local) mudava, o resto não.
    if (res.ok) void refreshInstallation();
  }

  const isActivePreset = (hex: string) =>
    hex.toLowerCase() === primaryColor.trim().toLowerCase();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Identidade visual</CardTitle>
        <CardDescription>
          Como o painel aparece para você e sua equipe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-6">
          {/* Desktop: dois blocos lado a lado (marca | funcionamento). */}
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            {/* Bloco: marca */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="inst-name">Nome da empresa</Label>
                <Input
                  id="inst-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="inst-logo">URL do logo</Label>
                <Input
                  id="inst-logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground">
                  Upload próprio fica para versão futura — por enquanto, cole a URL
                  da imagem.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="inst-color">Cor primária</Label>
                <div className="flex items-center gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setPrimaryColor(p.hex)}
                      aria-label={`Cor ${p.name}`}
                      aria-pressed={isActivePreset(p.hex)}
                      title={p.name}
                      className={cn(
                        "size-8 rounded-full border-2 transition-transform",
                        isActivePreset(p.hex)
                          ? "border-foreground scale-110"
                          : "border-transparent hover:scale-105",
                      )}
                      style={{ backgroundColor: p.hex }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="inst-color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="max-w-[160px] font-mono"
                  />
                  <span
                    aria-hidden="true"
                    className="size-9 shrink-0 rounded-md border border-border"
                    style={{ backgroundColor: primaryColor }}
                  />
                </div>
              </div>
            </div>

            {/* Bloco: horário de FUNCIONAMENTO (faixa da grade da agenda — distinto
                de "Horários", que é o atendimento por profissional). No mobile,
                divisória no topo; no desktop, coluna ao lado. */}
            <div className="flex flex-col gap-2 border-t border-border pt-6 lg:border-t-0 lg:pt-0">
              <Label>Horário de funcionamento</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Abre</span>
                  <Input
                    type="time"
                    aria-label="Abertura"
                    className="w-32"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Fecha</span>
                  <Input
                    type="time"
                    aria-label="Fechamento"
                    className="w-32"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                É a faixa que a agenda mostra (ex.: 10:00–21:00).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <Button type="submit" disabled={status === "saving"}>
              Salvar
            </Button>
            {validationError && (
              <p role="alert" className="text-sm text-destructive">
                {validationError}
              </p>
            )}
            {!validationError && status === "saved" && (
              <p role="status" className="text-sm text-muted-foreground">
                Salvo.
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
  );
}
