import { useEffect, useSyncExternalStore } from "react";
import { authedRequest } from "./session";

export interface Installation {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

// Mesma chave usada pelo AuthContext para o access token.

/**
 * Store compartilhado da identidade da instalação. O branding (cor/nome/logo) é
 * lido em vários pontos (AppShell etc.); manter em UM cache com assinatura evita
 * o bug de "só repinta após reload": qualquer consumidor revalida via
 * `refreshInstallation()` e TODOS reagem na hora (useSyncExternalStore).
 */
let cache: Installation | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Installation | null {
  return cache;
}

/**
 * Busca `/installation` e notifica todos os consumidores. Chamar após salvar em
 * Configurações → Identidade para a cor/nome/logo repintarem na hora, sem reload.
 */
export async function refreshInstallation(): Promise<void> {
  try {
    const res = await authedRequest("/installation", {});
    if (res.ok) {
      cache = (await res.json()) as Installation;
      for (const notify of listeners) notify();
    }
  } catch {
    /* branding é best-effort; o header cai no fallback */
  }
}

/** Identidade da instalação atual (compartilhada). Revalida no mount e sob demanda. */
export function useInstallation(): Installation | null {
  const data = useSyncExternalStore(subscribe, getSnapshot);
  // Revalida a cada mount (cobre troca de login) — e, com o store, o resultado
  // chega a TODOS os consumidores montados, não só a este.
  useEffect(() => {
    void refreshInstallation();
  }, []);
  return data;
}
