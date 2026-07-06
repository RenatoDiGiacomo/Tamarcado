import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useInstallation } from "../lib/useInstallation";
import { hexToHslTriplet } from "../lib/theme";

const DESKTOP_QUERY = "(min-width: 768px)";

interface NavItem {
  key: string;
  label: string;
  badge?: boolean;
}

/** Itens visíveis nas tabs mobile (UX-DR7). */
const MOBILE_ITEMS: NavItem[] = [
  { key: "agenda", label: "Agenda" },
  { key: "pendentes", label: "Pendentes", badge: true },
  { key: "clientes", label: "Clientes" },
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

  // Sidebar inclui Pagamentos e (só owner) Configurações.
  const sidebarItems: NavItem[] = [
    ...MOBILE_ITEMS,
    { key: "pagamentos", label: "Pagamentos" },
    ...(isOwner ? [{ key: "config", label: "Configurações" }] : []),
  ];

  const badge = <span data-testid="badge-pendentes" aria-label="Pendentes" />;

  const brand = installation?.logoUrl ? (
    <img
      src={installation.logoUrl}
      alt={installation.name}
      style={{ height: 28, verticalAlign: "middle" }}
    />
  ) : (
    <strong>{installation?.name ?? "Tamarcado"}</strong>
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.5rem 1rem",
          background: "var(--surface)",
          borderBottom: "2px solid var(--primary)",
        }}
      >
        <Link
          to="/"
          aria-label="Início"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          {brand}
        </Link>
        <span>
          <Link to="/perfil" style={{ marginRight: "0.75rem" }}>
            {user?.name}
          </Link>
          <button type="button" onClick={logout}>
            Sair
          </button>
        </span>
      </header>

      <div style={{ display: "flex" }}>
        {isDesktop && (
          <nav
            aria-label="Navegação lateral"
            style={{
              width: 200,
              padding: "1rem",
              borderRight: "1px solid var(--border)",
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {sidebarItems.map((item) => (
                <li key={item.key} style={{ padding: "0.4rem 0" }}>
                  {item.key === "config" ? (
                    <Link to="/configuracoes/identidade">{item.label}</Link>
                  ) : (
                    item.label
                  )}
                  {item.badge ? badge : null}
                </li>
              ))}
            </ul>
          </nav>
        )}

        <main style={{ flex: 1, padding: "1rem" }}>{children}</main>
      </div>

      {!isDesktop && (
        <nav
          aria-label="Navegação inferior"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-around",
            borderTop: "1px solid var(--border)",
            padding: "0.5rem 0",
            background: "var(--surface)",
          }}
        >
          {MOBILE_ITEMS.map((item) => (
            <span key={item.key}>
              {item.label}
              {item.badge ? badge : null}
            </span>
          ))}
          <button
            type="button"
            aria-label="Ações rápidas"
            onClick={() => setQuickOpen((v) => !v)}
          >
            +
          </button>
          {quickOpen && (
            <ul
              role="menu"
              style={{ position: "fixed", bottom: "3rem", right: "1rem" }}
            >
              <li role="menuitem">Novo agendamento</li>
              <li role="menuitem">Nova cliente</li>
              <li role="menuitem">Registrar pagamento</li>
            </ul>
          )}
        </nav>
      )}
    </div>
  );
}
