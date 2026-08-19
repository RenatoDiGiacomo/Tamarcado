import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authedRequest } from "./session";
import { useAuth } from "../auth/AuthContext";

const POLL_MS = 15000; // refresh curto (Story 5B.3)

interface PendentesCtx {
  count: number;
  /** Reconsulta o contador na hora (após confirmar/recusar). */
  refresh: () => void;
}

const PendentesContext = createContext<PendentesCtx>({
  count: 0,
  refresh: () => {},
});

/**
 * Estado compartilhado do contador de PENDENTES (Story 5B.3) — um provider com
 * refresh curto que alimenta o badge da navegação, sem recarregar a página.
 * Consulta para TODO autenticado; o backend ESCOPA o contador (o profissional
 * conta só os pendentes dele; quem gerencia a equipe conta todos — refino
 * DL-062, 2026-08-14). O polling de flags do AuthContext faz o número mudar
 * (todos ↔ só os meus) sem relogar quando o Dono liga/desliga o acesso.
 */
export function PendentesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canSee = user != null;
  const [count, setCount] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    if (!canSee) return;
    try {
      const res = await authedRequest("/appointments/pending-count", {
        });
      if (res.ok) {
        setCount(((await res.json()) as { count: number }).count);
      }
    } catch {
      /* best-effort — não quebra a navegação */
    }
  }, [canSee]);

  useEffect(() => {
    if (!canSee) {
      setCount(0);
      return;
    }
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [canSee, refresh]);

  return (
    <PendentesContext.Provider value={{ count, refresh: () => void refresh() }}>
      {children}
    </PendentesContext.Provider>
  );
}

export function usePendentes(): PendentesCtx {
  return useContext(PendentesContext);
}
