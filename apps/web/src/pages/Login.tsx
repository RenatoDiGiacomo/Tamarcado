import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { useAuth, type CompanyChoice } from "../auth/AuthContext";
import { ApiConnectionError, CONNECTION_ERROR_MESSAGE } from "../lib/api";
import { consumeSessionExpired } from "../lib/session";
import { PwaInstall } from "../components/PwaInstall";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Desambiguação (DL-052): quando o e-mail existe em >1 empresa, o backend
  // devolve a lista e mostramos a escolha antes de validar a senha.
  const [choices, setChoices] = useState<CompanyChoice[] | null>(null);
  // Sessão expirada: quando o refresh também venceu, o app cai aqui — mostramos
  // o motivo em vez de deixar o usuário achando que "deslogou do nada".
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (consumeSessionExpired()) setExpired(true);
  }, []);

  function messageFor(err: unknown): string {
    // Distingue "não deu para falar com o servidor" (rede/CORS/timeout) de
    // credencial inválida — antes toda falha virava "senha incorreta".
    return err instanceof ApiConnectionError
      ? CONNECTION_ERROR_MESSAGE
      : "E-mail ou senha incorretos. Tente novamente.";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const multi = await login(email, password);
      if (multi) {
        setChoices(multi); // e-mail em várias empresas → escolher
        return;
      }
      navigate("/");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** Entra no estabelecimento escolhido (valida a senha naquele tenant). */
  async function chooseCompany(companyId: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, companyId);
      navigate("/");
    } catch (err) {
      setError(messageFor(err));
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
          {expired && !choices && (
            <p
              role="status"
              className="mb-4 rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
            >
              Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}
          {choices ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">
                  Escolha o estabelecimento
                </p>
                <p className="text-xs text-muted-foreground">
                  Este e-mail tem acesso a mais de um. Em qual você quer entrar?
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {choices.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant="secondary"
                    className="justify-start"
                    disabled={submitting}
                    onClick={() => void chooseCompany(c.id)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setChoices(null);
                  setError(null);
                }}
                className="mt-1 inline-flex items-center gap-1 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Voltar
              </button>
            </div>
          ) : (
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
          )}
          {/* Versão discreta no canto inferior direito do card (lida do
              package.json na build — ver src/lib/version.ts). */}
          <p className="mt-4 text-right text-[11px] text-muted-foreground">
            {APP_VERSION}
          </p>
        </CardContent>
      </Card>

      {/* Instalar o app (mobile) — discreto, abaixo do card (Story 7.1). */}
      <PwaInstall />

      <footer className="text-xs text-muted-foreground">
        Desenvolvido por Nordiq.tech
      </footer>
    </main>
  );
}
