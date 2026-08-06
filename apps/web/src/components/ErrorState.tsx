import { CloudOff, ServerCrash } from "lucide-react";
import { ApiConnectionError } from "../lib/api";
import { Button } from "./ui/button";

/** Falha de REDE (não chegou ao servidor) vs. erro do SERVIDOR (respondeu mal). */
export type ErrorKind = "connection" | "server";

/** Classifica o que caiu no catch: transporte (ApiConnectionError) ou servidor. */
export function errorKindFrom(err: unknown): ErrorKind {
  return err instanceof ApiConnectionError ? "connection" : "server";
}

/**
 * Estado de ERRO ao carregar uma tela (Story 7.3 §3). Distingue "sem conexão"
 * (rede/CORS/timeout) de "erro do servidor" (4xx/5xx) — mensagens diferentes,
 * como já feito no login — e oferece uma ação de tentar de novo. Nunca deixa a
 * tela vazia parecendo que "não há dados".
 */
export function ErrorState({
  kind,
  resource,
  onRetry,
}: {
  kind: ErrorKind;
  /** O que falhou, para a mensagem: "a agenda", "os clientes", "a equipe"… */
  resource: string;
  onRetry: () => void;
}) {
  const connection = kind === "connection";
  const Icon = connection ? CloudOff : ServerCrash;
  const title = connection
    ? "Sem conexão"
    : `Não foi possível carregar ${resource}`;
  const description = connection
    ? "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo."
    : "Tivemos um problema no servidor. Tente de novo em instantes.";
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center"
    >
      <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Button variant="secondary" className="mt-2" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
