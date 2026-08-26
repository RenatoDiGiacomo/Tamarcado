import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, MailCheck } from "lucide-react";
import { apiRequest, ApiConnectionError, CONNECTION_ERROR_MESSAGE } from "../lib/api";
import LogoVerticalClaro from "../logos/logo-vertical-claro.svg?react";
import LogoVerticalEscuro from "../logos/logo-vertical-escuro.svg?react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Esqueci minha senha" — pede o e-mail e dispara o envio do link.
 *
 * A tela de confirmação é **igual exista ou não conta com aquele e-mail**: o
 * backend responde sempre a mesma coisa de propósito (senão o formulário
 * viraria uma forma de descobrir quem tem conta no sistema), e a UI não pode
 * desfazer isso mostrando "e-mail não encontrado".
 */
export function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      if (res.status === 429) {
        // Único erro que o usuário precisa entender: pediu demais.
        setErro("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        return;
      }
      if (!res.ok) {
        // Erro nosso (5xx). Dizer "enviado" aqui seria mentira — a pessoa
        // ficaria esperando um e-mail que não saiu.
        setErro("Não consegui enviar agora. Tente de novo em instantes.");
        return;
      }
      // Resposta boa vira "enviado" SEM olhar o conteúdo: o backend responde o
      // mesmo 200 para e-mail cadastrado e não cadastrado, e a tela não pode
      // desfazer isso mostrando uma diferença.
      setEnviado(true);
    } catch (err) {
      setErro(
        err instanceof ApiConnectionError
          ? CONNECTION_ERROR_MESSAGE
          : "Não consegui enviar agora. Tente de novo em instantes.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="mb-6 flex justify-center">
            <LogoVerticalClaro className="h-16 w-auto dark:hidden" aria-hidden="true" />
            <LogoVerticalEscuro className="hidden h-16 w-auto dark:block" aria-hidden="true" />
          </div>

          {enviado ? (
            <div className="flex flex-col gap-4 text-center">
              <MailCheck
                className="mx-auto size-10 text-primary"
                aria-hidden="true"
              />
              <h1 className="text-lg font-semibold">Confira o seu e-mail</h1>
              <p role="status" className="text-sm text-muted-foreground">
                Se este e-mail estiver cadastrado, você vai receber as instruções
                para criar uma senha nova. O link vale por 1 hora.
              </p>
              <p className="text-sm text-muted-foreground">
                Não chegou? Veja também a caixa de spam.
              </p>
              <Button asChild variant="outline" className="mt-1 w-full">
                <Link to="/login">Voltar para o início</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="text-center">
                <h1 className="text-lg font-semibold">Esqueceu a senha?</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Informe o seu e-mail e enviamos um link para você criar uma
                  senha nova.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  aria-label="E-mail"
                  autoComplete="email"
                />
              </div>

              {erro && (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}

              <Button type="submit" disabled={enviando} className="mt-1 w-full">
                {enviando ? "Enviando..." : "Enviar link por e-mail"}
              </Button>

              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Voltar para o início
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
