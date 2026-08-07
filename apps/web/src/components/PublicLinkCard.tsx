import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { apiRequest } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const ACCESS_KEY = "tamarcado.access";
const token = (): string | null => localStorage.getItem(ACCESS_KEY);
// Mesmas regras do backend (DL-049): kebab-case ASCII.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mensagem real da API (Nest `{ message }`), com fallback. */
async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string | string[] };
    const m = b?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo */
  }
  return fallback;
}

/** Copia texto sem exigir seleção manual (funciona no mobile). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Configurações → Identidade: LINK PÚBLICO de agendamento (DL-049). Mostra o
 * endereço completo em destaque (copiar/abrir) e permite editar o slug. Trocar
 * o slug NÃO tem redirect do antigo — exige confirmação explícita com o aviso.
 */
export function PublicLinkCard() {
  const [slug, setSlug] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void apiRequest("/installation", { token: token() }).then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { slug: string; publicUrl: string };
      setSlug(data.slug);
      setPublicUrl(data.publicUrl);
      setDraft(data.slug);
    });
  }, []);

  const invalid = draft !== "" && !SLUG_RE.test(draft);
  const changed = draft !== slug && draft !== "";

  async function copy(): Promise<void> {
    if (await copyText(publicUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function confirmChange(): Promise<void> {
    setSaving(true);
    setError(null);
    const res = await apiRequest("/installation/slug", {
      method: "PATCH",
      body: { slug: draft },
      token: token(),
    });
    if (!res.ok) {
      setError(await apiError(res, "Não foi possível trocar o endereço."));
      setSaving(false);
      return;
    }
    const data = (await res.json()) as { slug: string; publicUrl: string };
    setSlug(data.slug);
    setPublicUrl(data.publicUrl);
    setDraft(data.slug);
    setSaving(false);
    setConfirmOpen(false);
  }

  // Prefixo estático do endereço (tudo menos o slug), para o campo de edição.
  const prefix = publicUrl.replace(new RegExp(`${slug}$`), "");

  return (
    <Card className="w-full lg:max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg">Link público de agendamento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Endereço em destaque — copiável sem seleção manual (mobile) */}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">
            É o endereço que suas clientes usam para agendar. Divulgue no seu site,
            Instagram e WhatsApp.
          </span>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center">
            <span className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">
              {publicUrl || "—"}
            </span>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void copy()}
                disabled={!publicUrl}
              >
                {copied ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                asChild
                disabled={!publicUrl}
              >
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Abrir
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Edição do slug */}
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <Label htmlFor="slug">Endereço personalizado</Label>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <span className="shrink-0 break-all font-mono text-xs text-muted-foreground">
              {prefix}
            </span>
            <Input
              id="slug"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              aria-label="Endereço personalizado (slug)"
              className="font-mono sm:max-w-xs"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Só minúsculas, números e hífens — sem acento, espaço ou caractere
            especial.
          </span>
          {invalid && (
            <p role="alert" className="text-sm text-destructive">
              Endereço inválido: use apenas minúsculas, números e hífens.
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            disabled={!changed || invalid}
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            Salvar novo endereço
          </Button>
        </div>
      </CardContent>

      {/* Confirmação — aviso EXPLÍCITO de que não há redirect (DL-049) */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar o endereço do link?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-muted-foreground">
              O endereço vai mudar de{" "}
              <strong className="break-all font-mono text-foreground">
                {slug}
              </strong>{" "}
              para{" "}
              <strong className="break-all font-mono text-foreground">
                {draft}
              </strong>
              .
            </p>
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-foreground">
              <strong>Atenção:</strong> não há redirecionamento do endereço
              antigo. Todo link já divulgado — site, Instagram, WhatsApp — vai{" "}
              <strong>parar de funcionar</strong>. Só troque se for atualizar
              esses lugares também.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmChange()}
                disabled={saving}
              >
                {saving ? "Trocando…" : "Sim, trocar o endereço"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
