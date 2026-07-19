import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Abas horizontais da seção Configurações — mesmo visual do toggle `[Dia|Semana]`
 * da Agenda (Segmented). São route-driven: a aba ativa reflete a URL (NavLink).
 * Equipe segue como aba desabilitada ("em breve") — Story 3.3.3; Horários entrou na 3.3.2.
 */
interface Tab {
  label: string;
  to: string | null;
}

const TABS: Tab[] = [
  { label: "Serviços", to: "/configuracoes/servicos" },
  { label: "Horários", to: "/configuracoes/horarios" },
  { label: "Equipe", to: null },
  { label: "Identidade visual", to: "/configuracoes/identidade" },
];

const ITEM = "px-3 py-1.5 text-sm font-semibold transition-colors";

export function ConfiguracoesTabs() {
  return (
    <div
      role="tablist"
      aria-label="Seções de Configurações"
      className="inline-flex overflow-hidden rounded-md border border-border"
    >
      {TABS.map((tab) =>
        tab.to ? (
          <NavLink
            key={tab.label}
            to={tab.to}
            role="tab"
            className={({ isActive }) =>
              cn(
                ITEM,
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )
            }
          >
            {tab.label}
          </NavLink>
        ) : (
          <span
            key={tab.label}
            role="tab"
            aria-disabled="true"
            title="Em breve"
            className={cn(ITEM, "cursor-not-allowed text-muted-foreground opacity-50")}
          >
            {tab.label}
          </span>
        ),
      )}
    </div>
  );
}
