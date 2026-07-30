import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { Perfil } from "./pages/Perfil";
import { Agenda } from "./pages/Agenda";
import { Clientes } from "./pages/Clientes";
import { ClientePerfil } from "./pages/ClientePerfil";
import { Configuracoes } from "./pages/Configuracoes";
import { ConfiguracoesIdentidade } from "./pages/ConfiguracoesIdentidade";
import { ConfiguracoesServicos } from "./pages/ConfiguracoesServicos";
import { ConfiguracoesHorarios } from "./pages/ConfiguracoesHorarios";
import { ConfiguracoesEquipe } from "./pages/ConfiguracoesEquipe";
import { AceitarConvite } from "./pages/AceitarConvite";
import { PublicAgendar } from "./pages/PublicAgendar";
import { Pendentes } from "./pages/Pendentes";
import { DesignSystemDemo } from "./pages/DesignSystemDemo";
import { AppShell } from "./components/AppShell";
import { PendentesProvider } from "./lib/usePendentes";

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
      <PendentesProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </PendentesProvider>
    </Protected>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Aceite de convite (Story 3.3.3, UX-DR14): pública, a pessoa cria a senha. */}
      <Route path="/aceitar-convite" element={<AceitarConvite />} />
      {/* Agendamento público por link (Story 5B.1): pública, sem login, por slug. */}
      <Route path="/agendar/:slug" element={<PublicAgendar />} />
      {/* Demo pública do Design System (Story 2.1) — para revisão visual. */}
      <Route path="/demo" element={<DesignSystemDemo />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Agenda />} />
        <Route path="/pendentes" element={<Pendentes />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClientePerfil />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/configuracoes" element={<Configuracoes />}>
          <Route index element={<Navigate to="identidade" replace />} />
          <Route path="identidade" element={<ConfiguracoesIdentidade />} />
          <Route path="servicos" element={<ConfiguracoesServicos />} />
          <Route path="horarios" element={<ConfiguracoesHorarios />} />
          <Route path="equipe" element={<ConfiguracoesEquipe />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
