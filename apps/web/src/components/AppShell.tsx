import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CreditCard, Inbox, Settings, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useInstallation } from "../lib/useInstallation";
import { usePendentes } from "../lib/usePendentes";
import { hexToHslTriplet } from "../lib/theme";
import { APP_VERSION } from "../lib/version";

const DESKTOP_QUERY = "(min-width: 768px)";

// Itens da nav mantidos no código mas NÃO renderizados por ora. Pagamentos
// volta depois (provavelmente como "Financeiro") — por isso o item segue em
// NAV_ITEMS, só é filtrado da renderização. — ajuste 2.1.NN
const HIDDEN_NAV_KEYS = new Set(["pagamentos"]);

interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** Sem tela ainda — item aparece "em breve", desabilitado (não navegável). */
  disabled?: boolean;
  /** Contador (ex.: pendentes) — mostra badge quando > 0. */
  badge?: number;
}

/**
 * Navegação principal. "Pendentes" entra só para owner/gerente (Story 5B.3, o
 * link público passa a gerar solicitações a tratar) e é montado à parte, logo
 * após a Agenda. Clientes ativa na Story 4.1; Pagamentos ainda não tem tela —
 * fica "em breve" (vira pacote de venda à parte), mesmo tratamento das abas de
 * Configurações.
 */
const NAV_ITEMS: NavItem[] = [
  { key: "agenda", label: "Agenda", to: "/", icon: CalendarDays },
  { key: "clientes", label: "Clientes", to: "/clientes", icon: Users },
  { key: "pagamentos", label: "Pagamentos", to: "/pagamentos", icon: CreditCard, disabled: true },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const installation = useInstallation();
  const { count: pendingCount } = usePendentes();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isOwner = user?.accessLevel === "owner";
  const canSeePendentes =
    user?.accessLevel === "owner" || user?.accessLevel === "manager";
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

  // Pendentes (Story 5B.3): só owner/gerente; badge com o contador. Entra logo
  // após a Agenda (é o tratamento das solicitações que caem na agenda).
  const pendItem: NavItem = {
    key: "pendentes",
    label: "Pendentes",
    to: "/pendentes",
    icon: Inbox,
    badge: pendingCount,
  };
  const mainItems: NavItem[] = [
    NAV_ITEMS[0],
    ...(canSeePendentes ? [pendItem] : []),
    ...NAV_ITEMS.slice(1),
  ].filter((item) => !HIDDEN_NAV_KEYS.has(item.key));
  const items: NavItem[] = [
    ...mainItems,
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
                      {item.badge ? (
                        <span
                          aria-label={`${item.badge} pendentes`}
                          className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground"
                        >
                          {item.badge}
                        </span>
                      ) : null}
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
        {/* Versão discreta no canto inferior direito do painel (lida do
            package.json na build — ver src/lib/version.ts). */}
        <span className="pointer-events-none fixed bottom-2 right-3 text-[11px] text-muted-foreground">
          {APP_VERSION}
        </span>
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
        {mainItems.map((item) =>
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
              className="relative flex flex-col items-center gap-0.5 text-xs text-foreground no-underline"
            >
              <span className="relative">
                <item.icon className="size-5 shrink-0" />
                {item.badge ? (
                  <span
                    aria-label={`${item.badge} pendentes`}
                    className="absolute -right-2 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground"
                  >
                    {item.badge}
                  </span>
                ) : null}
              </span>
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
      {/* Versão discreta acima da nav inferior (lida do package.json na build). */}
      <span className="pointer-events-none fixed bottom-14 right-3 text-[11px] text-muted-foreground">
        {APP_VERSION}
      </span>
    </div>
  );
}
