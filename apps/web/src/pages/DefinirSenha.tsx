import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Definir nova senha por LINK (1.9.01). Rota pública: o dono abre o link de
 * redefinição (`/definir-senha?token=`), escolhe a própria senha e entra logado.
 * Reusa o mesmo backend do aceite de convite (`POST /auth/accept-invite`), que
 * redefine a senha de usuário existente. O link é de uso único e expira em 1h —
 * depois disso mostramos uma mensagem CLARA, não um erro genérico.
 */
export function DefinirSenha() {
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
        // Link inválido/expirado/já usado → mensagem clara, não genérica.
        setError(
          "Este link expirou ou já foi usado. Peça um link novo ao suporte.",
        );
        return;
      }
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      await applySession(data.accessToken, data.refreshToken);
      navigate("/");
    } catch {
      setError("Não foi possível definir a senha. Verifique sua conexão.");
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
            Defina uma nova senha de acesso ao painel
          </p>
        </CardHeader>
        <CardContent>
          {token === "" ? (
            <p role="alert" className="text-sm text-destructive">
              Link inválido — o token está ausente. Peça um link novo ao suporte.
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
                {submitting ? "Salvando..." : "Salvar nova senha e entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
