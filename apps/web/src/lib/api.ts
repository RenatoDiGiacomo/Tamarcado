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
  return fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
