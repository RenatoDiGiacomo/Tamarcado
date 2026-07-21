import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
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

/**
 * Aceite de convite (Story 3.3.3 / UX-DR14). Rota pública: a pessoa convidada
 * cria a própria senha no primeiro acesso a partir do `?token` do link, entra
 * logada e vai para o painel. Completa o fluxo de convite da Story 1.4.
 */
export function AceitarConvite() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("/auth/accept-invite", {
        method: "POST",
        body: { token, password },
      });
      if (!res.ok) {
        setError(await apiErrorMessage(res, "Não foi possível aceitar o convite."));
        return;
      }
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      await applySession(data.accessToken, data.refreshToken);
      navigate("/");
    } catch {
      setError("Não foi possível aceitar o convite. Verifique sua conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Tamarcado</h1>
          <p className="text-sm text-muted-foreground">
            Crie sua senha para entrar na equipe
          </p>
        </CardHeader>
        <CardContent>
          {token === "" ? (
            <p role="alert" className="text-sm text-destructive">
              Link de convite inválido — o token está ausente. Peça um novo convite ao dono.
            </p>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-label="Nova senha"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">Ao menos 8 caracteres.</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Confirmar senha</Label>
                <Input
                  id="confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  aria-label="Confirmar senha"
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={submitting} className="mt-1 w-full">
                {submitting ? "Entrando..." : "Criar senha e entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
