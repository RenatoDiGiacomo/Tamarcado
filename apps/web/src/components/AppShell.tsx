import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CreditCard, Settings, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useInstallation } from "../lib/useInstallation";
import { hexToHslTriplet } from "../lib/theme";

const DESKTOP_QUERY = "(min-width: 768px)";

interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** Sem tela ainda — item aparece "em breve", desabilitado (não navegável). */
  disabled?: boolean;
}

/**
 * Navegação principal (DL-036 manual-first — sem "Pendentes"). Clientes e
 * Pagamentos ainda não têm tela: ficam "em breve" (Clientes reativa na 4.1;
 * Pagamentos vira pacote de venda à parte) — mesmo tratamento das abas de
 * Configurações, para não prometer o que não existe na demo.
 */
const NAV_ITEMS: NavItem[] = [
  { key: "agenda", label: "Agenda", to: "/", icon: CalendarDays },
  { key: "clientes", label: "Clientes", to: "/clientes", icon: Users, disabled: true },
  { key: "pagamentos", label: "Pagamentos", to: "/pagamentos", icon: CreditCard, disabled: true },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const installation = useInstallation();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isOwner = user?.accessLevel === "owner";
  const [quickOpen, setQuickOpen] = useState(false);

  // Aplica tema individual (users.theme) e a cor primária da instalação (AC3/AC4).
  useEffect(() => {
    document.documentElement.dataset.theme = user?.theme ?? "light";
  }, [user?.theme]);
  useEffect(() => {
    // Cor primária do salão em canais HSL (shadcn/Tailwind, DL-037).
    const triplet = installation?.primaryColor
      ? hexToHslTriplet(installation.primaryColor)
      : null;
    if (triplet) {
      const root = document.documentElement.style;
      root.setProperty("--primary", triplet);
      root.setProperty("--ring", triplet);
    }
  }, [installation?.primaryColor]);

  const items: NavItem[] = [
    ...NAV_ITEMS,
    ...(isOwner
      ? [
          {
            key: "config",
            label: "Configurações",
            to: "/configuracoes",
            icon: Settings,
          },
        ]
      : []),
  ];

  const brand = installation?.logoUrl ? (
    <img src={installation.logoUrl} alt={installation.name} className="h-7" />
  ) : (
    <strong className="text-sm font-semibold text-foreground">
      {installation?.name ?? "Tamarcado"}
    </strong>
  );

  if (isDesktop) {
    return (
      <div className="flex min-h-screen bg-background text-foreground">
        <nav
          aria-label="Navegação lateral"
          className="flex w-56 shrink-0 flex-col justify-between border-r border-border bg-card p-4"
        >
          <div className="flex flex-col gap-6">
            <Link to="/" aria-label="Início" className="no-underline">
              {brand}
            </Link>
            <ul className="flex flex-col gap-1">
              {items.map((item) =>
                item.disabled ? (
                  <li key={item.key}>
                    <span
                      aria-disabled="true"
                      title="Em breve"
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground opacity-50"
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide">
                        em breve
                      </span>
                    </span>
                  </li>
                ) : (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent"
                    >
                      <item.icon className="size-4 shrink-0 text-muted-foreground" />
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
            <Link
              to="/perfil"
              className="truncate text-muted-foreground no-underline hover:text-foreground"
            >
              {user?.name}
            </Link>
            <button
              type="button"
              onClick={logout}
              className="text-muted-foreground hover:text-foreground"
            >
              Sair
            </button>
          </div>
        </nav>
        <main className="flex-1 p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b-2 border-primary bg-card px-4 py-2">
        <Link to="/" aria-label="Início" className="no-underline">
          {brand}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/perfil" className="text-muted-foreground no-underline">
            {user?.name}
          </Link>
          <button
            type="button"
            onClick={logout}
            className="text-muted-foreground"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="p-4 pb-20">{children}</main>

      <nav
        aria-label="Navegação inferior"
        className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-card py-2"
      >
        {NAV_ITEMS.map((item) =>
          item.disabled ? (
            <span
              key={item.key}
              aria-disabled="true"
              title="Em breve"
              className="flex cursor-not-allowed flex-col items-center gap-0.5 text-xs text-muted-foreground opacity-50"
            >
              <item.icon className="size-5 shrink-0" />
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              to={item.to}
              className="flex flex-col items-center gap-0.5 text-xs text-foreground no-underline"
            >
              <item.icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          ),
        )}
        <button
          type="button"
          aria-label="Ações rápidas"
          onClick={() => setQuickOpen((v) => !v)}
          className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
        >
          +
        </button>
        {quickOpen && (
          <ul
            role="menu"
            className="fixed bottom-14 right-4 flex flex-col gap-1 rounded-md border border-border bg-popover p-2 text-sm shadow-lg"
          >
            <li role="menuitem" className="px-2 py-1">
              Novo agendamento
            </li>
            <li role="menuitem" className="px-2 py-1">
              Nova cliente
            </li>
            <li role="menuitem" className="px-2 py-1">
              Registrar pagamento
            </li>
          </ul>
        )}
      </nav>
    </div>
  );
}
