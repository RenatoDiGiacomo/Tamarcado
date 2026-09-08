// Cliente HTTP fino para a API. Prefixa /api e injeta o Bearer token.
const API_PORT = 3000;

// Resolve a base da API. Ordem:
// 1. VITE_API_URL — a build de produção define isto (host real da API). Vence.
// 2. DEV: segue o HOST DE ACESSO (window.location.hostname). No PC = localhost;
//    abrindo pela rede local pelo IP da máquina = esse mesmo IP. Assim o celular
//    (mesmo Wi-Fi) alcança a API na máquina de dev, em vez de resolver
//    "localhost" como o próprio aparelho. Só afeta dev.
// 3. Fallback (SSR/testes sem window): localhost.
function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_API_URL as string | undefined;
  if (explicit) return explicit;
  if (import.meta.env.DEV && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  return `http://localhost:${API_PORT}`;
}

const BASE_URL: string = resolveApiBase();

/** Tempo máximo por requisição antes de tratar como falha de conexão. */
const REQUEST_TIMEOUT_MS = 15000;

/** Mensagem única para o usuário quando NÃO deu para falar com a API. */
export const CONNECTION_ERROR_MESSAGE =
  "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";

/**
 * Falha de TRANSPORTE (rede caiu, CORS bloqueou, DNS, timeout) — a requisição
 * nunca chegou a uma resposta HTTP. É distinta de uma resposta de erro do
 * servidor (4xx/5xx), que resolve normalmente com `res.ok === false`. Serve
 * para a UI não confundir "servidor fora do ar" com "credencial inválida".
 */
export class ApiConnectionError extends Error {
  constructor(public readonly original?: unknown) {
    super(CONNECTION_ERROR_MESSAGE);
    this.name = "ApiConnectionError";
  }
}

/**
 * Motivo de um 403 MARCADO pelo backend (Story 6.15). Espelha
 * `common/errors/forbidden-reason.ts` da API.
 *
 * Os três NÃO são a mesma coisa para quem está na tela:
 * - `capability`: a EMPRESA não contratou (DL-072) → tem caminho de venda;
 * - `module`: a PESSOA não tem o módulo (DL-062) → falar com o dono;
 * - `role`: o PAPEL não permite (FR-I2) → falar com o dono.
 */
export type ForbiddenReason = "capability" | "module" | "role";

const FORBIDDEN_REASONS: readonly string[] = ["capability", "module", "role"];

/** Corpo de um 403 marcado, como o backend serializa. */
interface ForbiddenPayload {
  reason?: unknown;
  capability?: unknown;
  module?: unknown;
}

/**
 * 403 que o backend MARCOU com o motivo (Story 6.15).
 *
 * Existe para a UI parar de tratar bloqueio como defeito: antes, todo 403 caía
 * no "Tivemos um problema no servidor. Tente de novo em instantes" — um botão
 * que nunca ia funcionar, para um bloqueio que era comercial.
 *
 * O motivo vem do CAMPO `reason`, nunca do texto da mensagem nem da rota:
 * texto muda no primeiro ajuste de copy e rota não diz nada sobre o porquê.
 */
export class ApiForbiddenError extends Error {
  constructor(
    public readonly reason: ForbiddenReason,
    public readonly capability?: string,
    public readonly module?: string,
  ) {
    super("Acesso bloqueado");
    this.name = "ApiForbiddenError";
  }
}

/**
 * Lê o corpo de uma resposta 403 e devolve o erro tipado — ou `null` se o 403
 * não é marcado (de terceiros, proxy, versão antiga da API). Sem marca, nada
 * muda: o chamador segue tratando como sempre tratou.
 *
 * Usa `clone()` para não consumir o corpo de quem ainda vá lê-lo.
 */
export async function forbiddenErrorFrom(
  res: Response,
): Promise<ApiForbiddenError | null> {
  if (res.status !== 403) return null;
  try {
    const body = (await res.clone().json()) as ForbiddenPayload;
    const reason = body?.reason;
    if (typeof reason !== "string" || !FORBIDDEN_REASONS.includes(reason)) {
      return null;
    }
    return new ApiForbiddenError(
      reason as ForbiddenReason,
      typeof body.capability === "string" ? body.capability : undefined,
      typeof body.module === "string" ? body.module : undefined,
    );
  } catch {
    // Corpo vazio ou não-JSON: 403 sem marca, comportamento antigo.
    return null;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
}

export function apiRequest(
  path: string,
  { method = "GET", body, token }: ApiRequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: controller.signal,
  })
    .catch((cause: unknown) => {
      // `fetch` só rejeita em falha de REDE/CORS/DNS ou no abort do timeout —
      // nunca em 4xx/5xx (esses resolvem com res.ok === false). Envolvemos num
      // erro tipado para a UI mostrar "sem conexão", não "credencial inválida".
      throw new ApiConnectionError(cause);
    })
    .finally(() => clearTimeout(timeoutId));
}
