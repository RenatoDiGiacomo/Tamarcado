import { useEffect, useState } from "react";

/** Reage a media queries (ex.: breakpoint do shell em 768px). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(
    () => window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (): void => setMatches(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * Breakpoint do shell (768px): o mesmo que o `AppShell` usa para decidir entre
 * sidebar (desktop) e tab bar (mobile), e o mesmo do `md:` do Tailwind. Telas
 * que trocam de FORMA — e não só de tamanho — entre celular e PC dependem dele.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
