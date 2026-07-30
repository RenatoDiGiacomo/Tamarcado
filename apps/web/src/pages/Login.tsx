import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ApiConnectionError, CONNECTION_ERROR_MESSAGE } from "../lib/api";
import { APP_VERSION } from "../lib/version";
// Logo vertical (ícone TM + wordmark empilhados) — variação por tema:
// wordmark preto no tema claro, branco no escuro. O check roxo é o mesmo nas
// duas. Importados como componente SVG (herdam layout/cor, sem requisição
// extra). O par é trocado por CSS (dark:) — ver globals/tailwind.
import LogoVerticalClaro from "../logos/logo-vertical-claro.svg?react";
import LogoVerticalEscuro from "../logos/logo-vertical-escuro.svg?react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  // Slug do tenant vindo da rota /app/{slug}/login (DL-050). Em /login genérico
  // fica undefined (dev tenant-único resolve sozinho; ver AUTH_ALLOW_SINGLE_TENANT).
  const { slug } = useParams<{ slug?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, slug);
      navigate("/");
    } catch (err) {
      // Distingue "não deu para falar com o servidor" (rede/CORS/timeout) de
      // credencial inválida — antes toda falha virava "senha incorreta".
      setError(
        err instanceof ApiConnectionError
          ? CONNECTION_ERROR_MESSAGE
          : "E-mail ou senha incorretos. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex flex-col items-center gap-2">
        <LogoVerticalClaro
          aria-label="Tamarcado"
          role="img"
          className="h-24 w-auto dark:hidden"
        />
        <LogoVerticalEscuro
          aria-label="Tamarcado"
          role="img"
          className="hidden h-24 w-auto dark:block"
        />
        <p className="text-sm text-muted-foreground">
          Sua Agenda Mais que Completa
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="E-mail"
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-label="Senha"
                  autoComplete="current-password"
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
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          {/* Versão discreta no canto inferior direito do card (lida do
              package.json na build — ver src/lib/version.ts). */}
          <p className="mt-4 text-right text-[11px] text-muted-foreground">
            {APP_VERSION}
          </p>
        </CardContent>
      </Card>

      <footer className="text-xs text-muted-foreground">
        Desenvolvido por Nordiq.tech
      </footer>
    </main>
  );
}
