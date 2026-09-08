import { CloudOff, ServerCrash } from "lucide-react";
import { ApiConnectionError, ApiForbiddenError } from "../lib/api";
import { Button } from "./ui/button";
import { BloqueioPermissao, BloqueioPro } from "./PlanoPro";

/**
 * O que impediu a tela de carregar.
 *
 * Os dois primeiros são falha; os dois últimos são BLOQUEIO — e a diferença não
 * é cosmética (Story 6.15). Até aqui todo 403 caía em `server`, então um recurso
 * não contratado aparecia como *"Tivemos um problema no servidor. Tente de novo
 * em instantes"*, com um botão que nunca ia funcionar. Bloqueio comercial com
 * cara de defeito — e, no caso da permissão, a pessoa achando que o sistema
 * quebrou quando na verdade faltava o dono liberar.
 *
 * - `connection`: não chegou ao servidor (rede/CORS/timeout) → tentar de novo faz sentido.
 * - `server`: o servidor respondeu mal (5xx, 4xx sem motivo) → tentar de novo faz sentido.
 * - `capability`: a EMPRESA não contratou (DL-072) → caminho de VENDA, sem "tentar de novo".
 * - `permission`: a PESSOA não tem acesso (DL-062 / FR-I2) → falar com o dono, sem oferta de plano.
 */
export type ErrorKind = "connection" | "server" | "capability" | "permission";

/**
 * Classifica o que caiu no catch. O 403 chega como `ApiForbiddenError` porque o
 * `authedRequest` o LANÇA quando o backend marcou o motivo — e o motivo vem do
 * campo `reason`, nunca do texto da mensagem nem da rota.
 */
export function errorKindFrom(err: unknown): ErrorKind {
  if (err instanceof ApiConnectionError) return "connection";
  if (err instanceof ApiForbiddenError) {
    // `module` e `role` são motivos diferentes no backend, mas a mesma coisa
    // para quem está na tela: quem libera é o dono do estabelecimento.
    return err.reason === "capability" ? "capability" : "permission";
  }
  return "server";
}

/** A capability barrada, quando o erro for de plano — para o texto de venda certo. */
export function capabilityFrom(err: unknown): string | undefined {
  return err instanceof ApiForbiddenError ? err.capability : undefined;
}

/**
 * Estado de ERRO ou BLOQUEIO ao carregar uma tela (Story 7.3 §3 + Story 6.15).
 *
 * Despacha internamente para o tratamento certo — é isto que faz toda tela que
 * já usa `<ErrorState>` ganhar o bloqueio correto **sem ser editada**, e o que
 * evita a "lista de exceções por tela" que o DL-075 proíbe.
 */
export function ErrorState({
  kind,
  resource,
  onRetry,
  capability,
}: {
  kind: ErrorKind;
  /** O que falhou, para a mensagem: "a agenda", "os clientes", "a equipe"… */
  resource: string;
  onRetry: () => void;
  /** Capability barrada (só usada quando `kind === "capability"`). */
  capability?: string;
}) {
  // BLOQUEIO por plano: quem decide é a Tamarcado, e há o que contratar.
  if (kind === "capability") {
    return <BloqueioPro capability={capability} />;
  }
  // BLOQUEIO por permissão: quem decide é o dono. NADA de oferta de plano aqui —
  // a pessoa não tem como comprar o que o dono já pagou.
  if (kind === "permission") {
    return <BloqueioPermissao recurso={resource} />;
  }

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
      {/* "Tentar de novo" só onde repetir pode dar certo. Num bloqueio, o botão
          seria uma promessa falsa — por isso os dois ramos acima não o têm. */}
      <Button variant="secondary" className="mt-2" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
