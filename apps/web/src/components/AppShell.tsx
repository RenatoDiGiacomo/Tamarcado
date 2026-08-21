import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CalendarPlus,
  CircleUser,
  CreditCard,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Settings,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { canViewModule } from "../lib/permissions";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useInstallation } from "../lib/useInstallation";
import { usePendentes } from "../lib/usePendentes";
import { hexToHslTriplet } from "../lib/theme";
import { APP_VERSION } from "../lib/version";

const DESKTOP_QUERY = "(min-width: 768px)";

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

const NAV_ITEMS: NavItem[] = [
  { key: "agenda", label: "Agenda", to: "/agenda", icon: CalendarDays },
  { key: "clientes", label: "Clientes", to: "/clientes", icon: Users },
];

/** Dashboard (Story 5.6) — PRIMEIRO no menu; só para quem tem o módulo (DL-062). */
const dashboardItem: NavItem = {
  key: "dashboard",
  label: "Dashboard",
  to: "/dashboard",
  icon: LayoutDashboard,
};

/** Financeiro (Story 5.2) — só aparece para quem tem o módulo (DL-062). */
const financeiroItem: NavItem = {
  key: "financeiro",
  label: "Financeiro",
  to: "/financeiro",
  icon: CreditCard,
};

/** Título da tela para a AppBar mobile (Épico 7). */
function screenTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname === "/" || pathname.startsWith("/agenda")) return "Agenda";
  if (pathname.startsWith("/pendentes")) return "Pendentes";
  if (pathname.startsWith("/clientes")) return "Clientes";
  if (pathname.startsWith("/financeiro")) return "Financeiro";
  if (pathname.startsWith("/equipe")) return "Equipe";
  if (pathname.startsWith("/configuracoes")) return "Configurações";
  if (pathname.startsWith("/perfil")) return "Perfil";
  return "Tamarcado";
}

/** Iniciais do usuário para o avatar. */
function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const installation = useInstallation();
  const { count: pendingCount } = usePendentes();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const navigate = useNavigate();
  const location = useLocation();
  const isOwner = user?.accessLevel === "owner";
  // Menu mobile (drawer da esquerda) — módulos + Perfil saem da barra inferior.
  const [menuOpen, setMenuOpen] = useState(false);
  // Pendentes é visível a todo autenticado; o backend ESCOPA (o profissional vê
  // só os pendentes dele; quem gerencia a equipe vê todos). Refino DL-062
  // (2026-08-14) — antes o item era escondido de quem não gerencia.
  const canSeePendentes = user != null;

  // Aplica tema individual (users.theme) e a cor primária da instalação (AC3/AC4).
  useEffect(() => {
    document.documentElement.dataset.theme = user?.theme ?? "light";
  }, [user?.theme]);
  useEffect(() => {
    const triplet = installation?.primaryColor
      ? hexToHslTriplet(installation.primaryColor)
      : null;
    if (triplet) {
      const root = document.documentElement.style;
      root.setProperty("--primary", triplet);
      root.setProperty("--ring", triplet);
    }
  }, [installation?.primaryColor]);

  const pendItem: NavItem = {
    key: "pendentes",
    label: "Pendentes",
    to: "/pendentes",
    icon: Inbox,
    badge: pendingCount,
  };
  const configItem: NavItem = {
    key: "config",
    label: "Configurações",
    to: "/configuracoes",
    icon: Settings,
  };
  // Equipe (Story 5.9) — menu próprio; módulo `equipe` (owner OU can_view_equipe),
  // igual a Financeiro/Dashboard. Entra em `mainItems`, não no bloco owner.
  const equipeItem: NavItem = {
    key: "equipe",
    label: "Equipe",
    to: "/equipe",
    icon: UserCog,
  };
  const ownerItems: NavItem[] = isOwner ? [configItem] : [];
  // Financeiro (Story 5.2) só para quem tem o módulo — igual ao menu não existir
  // para os demais (DL-062). O polling de flags do AuthContext faz aparecer/sumir
  // sem relogar.
  const canSeeFinanceiro = canViewModule(user, "financeiro");
  const canSeeDashboard = canViewModule(user, "dashboard");
  const canSeeEquipe = canViewModule(user, "equipe");
  // Dashboard (se tem) · Agenda · Pendentes (escopado) · Clientes · Financeiro
  // (se tem) · Equipe (se tem).
  const mainItems: NavItem[] = [
    ...(canSeeDashboard ? [dashboardItem] : []),
    NAV_ITEMS[0],
    ...(canSeePendentes ? [pendItem] : []),
    NAV_ITEMS[1],
    ...(canSeeFinanceiro ? [financeiroItem] : []),
    ...(canSeeEquipe ? [equipeItem] : []),
  ];
  // Desktop: sidebar inclui Equipe + Configurações (owner) ao fim.
  const items: NavItem[] = [...mainItems, ...ownerItems];

  // Cabeçalho (rule 6, 2026-08-14): mostra logo E nome juntos (antes era um OU
  // outro). O logo, quando existe, vem maior; o nome fica ao lado na mesma linha.
  const brand = (
    <div className="flex items-center gap-2">
      {installation?.logoUrl && (
        <img
          src={installation.logoUrl}
          alt=""
          className="h-10 w-auto shrink-0"
        />
      )}
      <strong className="truncate text-sm font-semibold text-foreground">
        {installation?.name ?? "Tamarcado"}
      </strong>
    </div>
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
            {/* Sair: ícone porta em vermelho (danger) + rótulo; §8.1 — mais leve
                que o destrutivo real "Cancelar agendamento". */}
            <button
              type="button"
              onClick={logout}
              aria-label="Sair"
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4 text-destructive" aria-hidden="true" />
              Sair
            </button>
          </div>
        </nav>
        <main className="flex-1 p-6">{children}</main>
        {/* Versão discreta no canto inferior direito — só desktop. */}
        <span className="pointer-events-none fixed bottom-2 right-3 text-[11px] text-muted-foreground">
          {APP_VERSION}
        </span>
      </div>
    );
  }

  // ---- MOBILE (Épico 7, revisto): barra FIXA de uso diário + FAB + Menu ----
  // Barra: Agenda · Pendentes · [FAB] · Clientes · [Menu]. Os três primeiros são
  // de uso diário e ficam fixos. Módulos (Dashboard/Financeiro/Equipe),
  // Configurações e Perfil vão para o DRAWER — gateados por permissão (DL-062),
  // então módulo novo entra no menu e não disputa espaço na barra.
  const agendaItem = NAV_ITEMS[0];
  const clientesItem = NAV_ITEMS[1];
  const menuItems: NavItem[] = [
    ...(canSeeDashboard ? [dashboardItem] : []),
    ...(canSeeFinanceiro ? [financeiroItem] : []),
    ...(canSeeEquipe ? [equipeItem] : []),
    ...(isOwner ? [configItem] : []),
    { key: "perfil", label: "Perfil", to: "/perfil", icon: CircleUser },
  ];

  const renderTab = (item: NavItem) => {
    const active = location.pathname.startsWith(item.to);
    return (
      <Link
        key={item.key}
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 text-[11px] font-medium no-underline ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
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
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* AppBar enxuta: título da tela + avatar (→ Perfil). Sem nome do salão. */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-[52px] items-center justify-between border-b border-border bg-background px-4">
        <span className="text-lg font-semibold">{screenTitle(location.pathname)}</span>
        <button
          type="button"
          onClick={() => navigate("/perfil")}
          aria-label="Perfil"
          className="grid size-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
        >
          {initials(user?.name)}
        </button>
      </header>

      {/* Conteúdo. Padding inferior = folga do FAB + safe-area (não cobre o
          último card). Padding superior = altura da AppBar. */}
      <main className="px-4 pb-[calc(76px+env(safe-area-inset-bottom))] pt-16">
        {children}
      </main>

      {/* Tab bar de 4 abas + FAB central (44px, calendar-plus, direto p/ Novo). */}
      <nav
        aria-label="Navegação inferior"
        className="fixed inset-x-0 bottom-0 z-20 flex items-start justify-around border-t border-border bg-card pt-[9px] pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
      >
        {renderTab(agendaItem)}
        {canSeePendentes ? renderTab(pendItem) : null}
        <div className="relative flex-1 self-stretch">
          <button
            type="button"
            aria-label="Novo agendamento"
            onClick={() => navigate("/agenda", { state: { novo: Date.now() } })}
            className="absolute left-1/2 top-[-11px] grid size-11 -translate-x-1/2 place-items-center rounded-full border-[3px] border-background bg-primary text-primary-foreground shadow-lg shadow-primary/40"
          >
            <CalendarPlus className="size-[21px]" aria-hidden="true" />
          </button>
        </div>
        {renderTab(clientesItem)}
        {/* Menu → abre o drawer da esquerda com módulos + Perfil. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
          className="flex flex-1 flex-col items-center gap-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <MenuIcon className="size-5 shrink-0" aria-hidden="true" />
          Menu
        </button>
      </nav>

      {/* Drawer do Menu — desliza da esquerda p/ a direita; itens gateados por
          permissão (DL-062): quem não tem o módulo não vê o item. */}
      {menuOpen && (
        <div className="fixed inset-0 z-30" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40 animate-in fade-in"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col border-r border-border bg-card shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-border p-4">
              <span className="text-base font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="flex flex-col gap-1 p-2">
              {menuItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(item.to);
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <item.icon className="size-4 shrink-0 text-muted-foreground" />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
