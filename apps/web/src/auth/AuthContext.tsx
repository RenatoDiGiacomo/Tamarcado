import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "../lib/api";

export interface CurrentUser {
  id: string;
  companyId: string;
  name: string;
  email: string;
  accessLevel: "owner" | "manager" | "basic";
  attendsClients: boolean;
  theme: "light" | "dark";
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
}

const ACCESS_KEY = "tamarcado.access";
const REFRESH_KEY = "tamarcado.refresh";

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
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
  }, []);

  /** Busca /users/me com refresh único em caso de 401. */
  const loadProfile = useCallback(async (): Promise<void> => {
    const access = localStorage.getItem(ACCESS_KEY);
    if (!access) {
      setUser(null);
      return;
    }
    let res = await apiRequest("/users/me", { token: access });
    if (res.status === 401) {
      const refreshed = await tryRefresh();
      if (!refreshed) {
        logout();
        return;
      }
      res = await apiRequest("/users/me", { token: refreshed });
    }
    if (res.ok) {
      setUser((await res.json()) as CurrentUser);
    } else {
      logout();
    }
  }, [logout]);

  async function tryRefresh(): Promise<string | null> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;
    const res = await apiRequest("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string };
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    return data.accessToken;
  }

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
      localStorage.setItem(ACCESS_KEY, data.accessToken!);
      localStorage.setItem(REFRESH_KEY, data.refreshToken!);
      await loadProfile();
      return null;
    },
    [loadProfile],
  );

  /** Aplica tokens já emitidos (ex.: aceite de convite) e carrega o perfil. */
  const applySession = useCallback(
    async (accessToken: string, refreshToken: string) => {
      localStorage.setItem(ACCESS_KEY, accessToken);
      localStorage.setItem(REFRESH_KEY, refreshToken);
      await loadProfile();
    },
    [loadProfile],
  );

  /** Grava a preferência de tema do próprio usuário e atualiza o estado. */
  const setTheme = useCallback(async (theme: "light" | "dark") => {
    const access = localStorage.getItem(ACCESS_KEY);
    const res = await apiRequest("/users/me", {
      method: "PATCH",
      body: { theme },
      token: access,
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
