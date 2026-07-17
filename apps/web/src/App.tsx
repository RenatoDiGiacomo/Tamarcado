import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { Perfil } from "./pages/Perfil";
import { Agenda } from "./pages/Agenda";
import { Configuracoes } from "./pages/Configuracoes";
import { ConfiguracoesIdentidade } from "./pages/ConfiguracoesIdentidade";
import { ConfiguracoesServicos } from "./pages/ConfiguracoesServicos";
import { DesignSystemDemo } from "./pages/DesignSystemDemo";
import { AppShell } from "./components/AppShell";

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <p>Carregando...</p>;
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Layout autenticado: o AppShell envolve as páginas internas (Outlet). */
function Layout() {
  return (
    <Protected>
      <AppShell>
        <Outlet />
      </AppShell>
    </Protected>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Demo pública do Design System (Story 2.1) — para revisão visual. */}
      <Route path="/demo" element={<DesignSystemDemo />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Agenda />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/configuracoes" element={<Configuracoes />}>
          <Route index element={<Navigate to="identidade" replace />} />
          <Route path="identidade" element={<ConfiguracoesIdentidade />} />
          <Route path="servicos" element={<ConfiguracoesServicos />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
