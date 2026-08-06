import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { Clock, Link2, Palette, Scissors, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Abas da seção Configurações — route-driven (NavLink reflete a URL).
 * DESKTOP: segmented em pill (como antes, há espaço de sobra).
 * MOBILE (< md): ícone em cima + rótulo embaixo + sublinhado na aba ativa —
 * o ícone carrega o reconhecimento, então o texto cabe inteiro (sem truncate).
 */
interface Tab {
  label: string;
  /** Rótulo curto para o mobile (quando o longo não caberia). */
  short?: string;
  to: string;
  Icon: ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { label: "Serviços", to: "/configuracoes/servicos", Icon: Scissors },
  { label: "Horários", to: "/configuracoes/horarios", Icon: Clock },
  { label: "Equipe", to: "/configuracoes/equipe", Icon: Users },
  { label: "Identidade visual", short: "Identidade", to: "/configuracoes/identidade", Icon: Palette },
  { label: "Link", to: "/configuracoes/link", Icon: Link2 },
];

export function ConfiguracoesTabs() {
  return (
    <div
      role="tablist"
      aria-label="Seções de Configurações"
      className="flex border-b border-border md:inline-flex md:rounded-md md:border md:border-border"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.label}
          to={tab.to}
          role="tab"
          aria-label={tab.label}
          className={({ isActive }) =>
            cn(
              // MOBILE: coluna ícone+rótulo, sublinhado; DESKTOP: pill horizontal.
              // Ícone/rótulo menores para caber 5 abas sem truncar em 412px.
              "-mb-px flex flex-1 flex-col items-center gap-1 border-b-2 border-transparent px-1 py-2 text-[11px] font-semibold transition-colors no-underline",
              "md:mb-0 md:flex-none md:flex-row md:gap-0 md:border-b-0 md:px-3 md:py-1.5 md:text-sm",
              isActive
                ? "border-primary text-primary md:bg-primary md:text-primary-foreground"
                : "text-muted-foreground md:hover:bg-accent",
            )
          }
        >
          <tab.Icon className="size-[18px] shrink-0 md:hidden" />
          {/* Rótulo curto no mobile, longo no desktop (ex.: Identidade[ visual]). */}
          <span className="md:hidden">{tab.short ?? tab.label}</span>
          <span className="hidden md:inline">{tab.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
