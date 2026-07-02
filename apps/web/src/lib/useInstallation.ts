import { useEffect, useState } from "react";
import { apiRequest } from "./api";

export interface Installation {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

// Mesma chave usada pelo AuthContext para o access token.
const ACCESS_KEY = "tamarcado.access";

/** Busca a identidade da instalação atual (GET /installation) para o branding. */
export function useInstallation(): Installation | null {
  const [data, setData] = useState<Installation | null>(null);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem(ACCESS_KEY);
    apiRequest("/installation", { token })
      .then(async (res) => {
        if (active && res.ok) {
          setData((await res.json()) as Installation);
        }
      })
      .catch(() => {
        /* branding é best-effort; header cai no fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  return data;
}
