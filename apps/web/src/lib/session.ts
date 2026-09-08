// Sessão do painel: tokens + renovação AUTOMÁTICA nas requisições autenticadas.
//
// Problema que isto resolve (bug de produção): o access token vence (TTL curto) e
// as telas davam erro sem renovar — só recarregando a página. Aqui o access é
// renovado sozinho no 401 e a requisição é refeita, sem o usuário perceber. Se o
// refresh também venceu, a sessão é encerrada e o app cai no /login com mensagem.
import {
  apiRequest,
  ApiConnectionError,
  forbiddenErrorFrom,
  type ApiRequestOptions,
} from "./api";

const ACCESS_KEY = "tamarcado.access";
const REFRESH_KEY = "tamarcado.refresh";
const EXPIRED_FLAG = "tamarcado.sessionExpired";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/** Marca "sessão expirada" para a tela de login mostrar mensagem clara. */
export function markSessionExpired(): void {
  sessionStorage.setItem(EXPIRED_FLAG, "1");
}
/** Lê e limpa o flag — a tela de login mostra a mensagem uma vez. */
export function consumeSessionExpired(): boolean {
  const v = sessionStorage.getItem(EXPIRED_FLAG);
  if (v) sessionStorage.removeItem(EXPIRED_FLAG);
  return v === "1";
}

// Handler chamado quando a sessão morre (refresh também venceu). O AuthContext o
// registra para fazer logout → o `Protected` redireciona ao /login. Fica aqui
// (fora do React) porque `authedRequest` é uma função de módulo.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

/**
 * Handler de 403 MARCADO (Story 6.15) — mesmo padrão do `onSessionExpired`
 * acima, e pelo mesmo motivo: `authedRequest` é função de módulo, fora do React.
 *
 * O AuthContext o registra para RECARREGAR O PERFIL quando um bloqueio aparece.
 * Isso fecha a janela de dessincronização: o operador corta a capability (ou o
 * dono revoga o módulo) e, em vez de esperar o próximo ciclo do polling de ~20s,
 * a rota reage na hora — `RequireCapability`/`RequireModule` passam a mostrar a
 * tela de bloqueio certa.
 *
 * Ele também cobre o ponto cego das MUTAÇÕES: várias chamam `authedRequest` sem
 * `try/catch` (buraco que já existe hoje para `ApiConnectionError`), então uma
 * rejeição ali ficaria muda. Com o handler, a UI converge para a explicação em
 * vez de simplesmente não reagir ao clique.
 */
let onForbidden: (() => void) | null = null;
export function setForbiddenHandler(fn: (() => void) | null): void {
  onForbidden = fn;
}

// Refresh SINGLE-FLIGHT: várias requisições que caem 401 ao mesmo tempo
// compartilham UMA chamada a /auth/refresh (sem estampar o endpoint nem correr
// atrás de tokens diferentes).
let refreshing: Promise<string | null> | null = null;

/**
 * Renova o access token pelo refresh token.
 * - devolve o novo access em caso de sucesso;
 * - devolve `null` se o refresh **venceu/inválido** (401) → sessão morta;
 * - PROPAGA `ApiConnectionError` se foi falha de REDE (não é sessão vencida —
 *   não desloga o usuário por um blip de conexão).
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    const res = await apiRequest("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    });
    if (!res.ok) return null; // 401/inválido = sessão realmente expirada
    const data = (await res.json()) as { accessToken: string };
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    return data.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Requisição AUTENTICADA com renovação automática de sessão:
 * 1. envia com o access token atual;
 * 2. se `401` (token vencido) → refresh (single-flight) → **refaz UMA vez** com
 *    o token novo — o usuário não percebe;
 * 3. se o refresh também venceu → encerra a sessão, marca "expirada" e chama o
 *    handler (logout → redireciona ao /login) e devolve o 401.
 *
 * Falha de REDE (`ApiConnectionError`) propaga normalmente — é "sem conexão",
 * não "sessão vencida"; o "tentar de novo" refaz quando a rede voltar.
 *
 * 403 MARCADO (Story 6.15) também PROPAGA, como `ApiForbiddenError`, em vez de
 * voltar como resposta. Isso é deliberado e é o que faz o bloqueio aparecer
 * certo em TODAS as telas de uma vez: o padrão delas é
 * `if (!res.ok) setErrorKind("server")` — hardcoded, sem olhar o status —, então
 * devolver a resposta faria o bloqueio continuar virando "erro de servidor".
 * Lançar desvia para o `catch` que as telas já têm, e o `errorKindFrom`
 * classifica. Sem lista de exceções por tela; sem editar página por página.
 *
 * 403 SEM marca (proxy, versão antiga da API) volta como resposta, igual a antes.
 */
export async function authedRequest(
  path: string,
  opts: Omit<ApiRequestOptions, "token"> = {},
): Promise<Response> {
  const res = await apiRequest(path, { ...opts, token: getAccessToken() });
  if (res.status === 403) {
    const forbidden = await forbiddenErrorFrom(res);
    if (forbidden) {
      onForbidden?.();
      throw forbidden;
    }
    return res;
  }
  if (res.status !== 401) return res;

  let newToken: string | null;
  try {
    newToken = await refreshAccessToken();
  } catch (err) {
    if (err instanceof ApiConnectionError) throw err; // sem conexão → propaga
    newToken = null;
  }

  if (!newToken) {
    clearSession();
    markSessionExpired();
    onSessionExpired?.();
    return res; // 401 — a UI já vai redirecionar ao login pelo handler
  }
  // Repetição após renovar o token: o 403 marcado também precisa propagar aqui,
  // senão o bloqueio escaparia justamente na requisição refeita.
  const retried = await apiRequest(path, { ...opts, token: newToken });
  if (retried.status === 403) {
    const forbidden = await forbiddenErrorFrom(retried);
    if (forbidden) {
      onForbidden?.();
      throw forbidden;
    }
  }
  return retried;
}
