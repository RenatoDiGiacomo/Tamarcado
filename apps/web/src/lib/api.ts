// Cliente HTTP fino para a API. Prefixa /api e injeta o Bearer token.
const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3000";

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
