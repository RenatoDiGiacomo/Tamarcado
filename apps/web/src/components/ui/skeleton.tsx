import { cn } from "@/lib/utils";

/**
 * Placeholder pulsante para o estado de CARREGAMENTO (Story 7.3 §2). Ocupa a
 * forma do conteúdo que vai chegar — não é spinner cobrindo a tela nem tela em
 * branco. Respeita `prefers-reduced-motion` (a animação é do utilitário Tailwind
 * `animate-pulse`, desligada por quem pede menos movimento).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
    />
  );
}
