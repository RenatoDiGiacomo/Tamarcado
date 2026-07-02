import { useAuth } from "../auth/AuthContext";

/** Tela de Perfil: preferência individual de tema claro/escuro (AC3, Story 1.7). */
export function Perfil() {
  const { user, setTheme } = useAuth();
  const isDark = user?.theme === "dark";

  return (
    <section>
      <h1>Perfil</h1>
      <p>
        {user?.name} — {user?.email}
      </p>
      <div>
        <span>Tema atual: {isDark ? "Escuro" : "Claro"}</span>{" "}
        <button
          type="button"
          onClick={() => void setTheme(isDark ? "light" : "dark")}
        >
          Alternar para {isDark ? "claro" : "escuro"}
        </button>
      </div>
    </section>
  );
}
