import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "../lib/api";
import {
  authedRequest,
  clearSession,
  getAccessToken,
  setSessionExpiredHandler,
  setTokens,
} from "../lib/session";

// Intervalo do polling de flags (DL-062). ~20s: rápido o bastante para uma
// revogação "sumir" quase na hora, leve o bastante para não pesar.
const FLAGS_POLL_MS = 20000;

export interface CurrentUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  accessLevel: "owner" | "manager";
  attendsClients: boolean;
  theme: "light" | "dark";
  // Flags de permissão (DL-062) — o front monta menu/rotas/escopo a partir daqui.
  // O `owner` ignora os flags (ver lib/permissions). Vêm de /users/me.
  canViewFinanceiro: boolean;
  canViewDashboard: boolean;
  canManageAllAppointments: boolean;
}

/** Estabelecimento oferecido na desambiguação de e-mail (DL-052). */
export interface CompanyChoice {
  id: string;
  name: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  /**
   * Login por e-mail (DL-052). Resolve `null` quando entra direto; resolve a
   * LISTA de estabelecimentos quando o e-mail existe em mais de uma empresa —
   * o chamador mostra a escolha e chama de novo com `companyId`.
   */
  login: (
    email: string,
    password: string,
    companyId?: string,
  ) => Promise<CompanyChoice[] | null>;
  logout: () => void;
  setTheme: (theme: "light" | "dark") => Promise<void>;
  /** Aplica uma sessão a partir de tokens (ex.: aceite de convite) e carrega o perfil. */
  applySession: (accessToken: string, refreshToken: string) => Promise<void>;
  /**
   * Recarrega o perfil (flags) SEM derrubar a sessão em falha transitória — é o
   * que faz uma concessão/revogação de acesso pelo Dono "aparecer" sem relogar
   * (DL-062). Chamado por polling e sob demanda (ex.: 403 de módulo).
   */
  refreshUser: () => Promise<void>;
}

/**
 * Rota de login para os redirects (sessão expirada, logout, rota protegida sem
 * sessão). URL ÚNICA (DL-052): o tenant é resolvido pelo backend a partir do
 * e-mail, então não há mais `/app/{slug}/login` nem slug guardado no navegador.
 */
export function loginPath(): string {
  return "/login";
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  /**
   * Busca /users/me. O `authedRequest` renova o access token sozinho no 401 e
   * refaz a chamada; se a sessão morreu de vez, ele limpa a sessão e dispara o
   * handler (abaixo) que zera o usuário → o `Protected` manda para o /login.
   */
  const loadProfile = useCallback(async (): Promise<void> => {
    if (!getAccessToken()) {
      setUser(null);
      return;
    }
    try {
      const res = await authedRequest("/users/me");
      setUser(res.ok ? ((await res.json()) as CurrentUser) : null);
    } catch {
      // Sem conexão no carregamento: não derruba a sessão guardada; segue sem
      // perfil (a próxima ação tenta de novo).
      setUser(null);
    }
  }, []);

  /**
   * Recarrega os flags do /users/me SEM derrubar a sessão em falha (≠ loadProfile,
   * que zera o usuário no erro). Assim o polling não desloga por um blip, e uma
   * concessão/revogação de acesso pelo Dono converge sozinha (DL-062).
   */
  const refreshUser = useCallback(async (): Promise<void> => {
    if (!getAccessToken()) return;
    try {
      const res = await authedRequest("/users/me");
      if (res.ok) {
        setUser((await res.json()) as CurrentUser);
      }
    } catch {
      /* poll é best-effort — mantém a sessão atual */
    }
  }, []);

  // Polling dos flags: enquanto autenticado, revê o /users/me periodicamente para
  // que ligar/desligar um acesso pelo Dono apareça sem relogar (menu/rotas somem
  // ou surgem no próximo ciclo). Gated por um BOOLEAN estável (não pelo objeto
  // `user`), senão o intervalo se reinicia a cada refresh.
  const authed = user !== null;
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => void refreshUser(), FLAGS_POLL_MS);
    return () => clearInterval(t);
  }, [authed, refreshUser]);

  // Quando a sessão morre dentro de uma requisição (refresh também venceu),
  // o session.ts chama isto → zera o usuário → o `Protected` redireciona ao
  // login (que mostra a mensagem de "sessão expirada").
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string,
      companyId?: string,
    ): Promise<CompanyChoice[] | null> => {
      const res = await apiRequest("/auth/login", {
        method: "POST",
        body: { email, password, companyId },
      });
      if (!res.ok) {
        throw new Error("Credenciais inválidas");
      }
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
        companies?: CompanyChoice[];
      };
      // E-mail em mais de uma empresa: devolve a lista para a tela de escolha
      // (a senha ainda não foi validada — DL-052). Nenhum token é guardado.
      if (data.companies) {
        return data.companies;
      }
      setTokens(data.accessToken!, data.refreshToken!);
      await loadProfile();
      return null;
    },
    [loadProfile],
  );

  /** Aplica tokens já emitidos (ex.: aceite de convite) e carrega o perfil. */
  const applySession = useCallback(
    async (accessToken: string, refreshToken: string) => {
      setTokens(accessToken, refreshToken);
      await loadProfile();
    },
    [loadProfile],
  );

  /** Grava a preferência de tema do próprio usuário e atualiza o estado. */
  const setTheme = useCallback(async (theme: "light" | "dark") => {
    const res = await authedRequest("/users/me", {
      method: "PATCH",
      body: { theme },
    });
    if (res.ok) {
      setUser((await res.json()) as CurrentUser);
    }
  }, []);

  useEffect(() => {
    void loadProfile().finally(() => setLoading(false));
  }, [loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: user !== null,
        login,
        logout,
        setTheme,
        applySession,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}
