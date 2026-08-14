import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth, loginPath } from "./auth/AuthContext";
import { canManageAllAppointments } from "./lib/permissions";
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
import { ConfiguracoesLinkPublico } from "./pages/ConfiguracoesLinkPublico";
import { AceitarConvite } from "./pages/AceitarConvite";
import { DefinirSenha } from "./pages/DefinirSenha";
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
  // URL única de login (DL-052): sessão expirada / rota interna sem sessão sempre
  // voltam para /login; o tenant é resolvido pelo backend a partir do e-mail.
  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to={loginPath()} replace />
  );
}

/**
 * Rota que exige gerenciar a agenda de TODA a equipe (DL-062): Pendentes. Quem
 * não tem cai na Agenda — a rota não "existe" para essa pessoa. Se o Dono revoga
 * com a sessão aberta, o polling de flags atualiza o `user` e este guard passa a
 * redirecionar sozinho (403-reativo no nível da rota), sem relogar.
 */
function RequireManageAll({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return canManageAllAppointments(user) ? <>{children}</> : <Navigate to="/" replace />;
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
      {/* Login do painel — URL ÚNICA (DL-052). O tenant é resolvido pelo backend
          pelo e-mail; não há mais slug na rota do painel. (O slug segue vital só
          no link público /agendar/{slug}.) */}
      <Route path="/login" element={<Login />} />
      {/* Aceite de convite (Story 3.3.3, UX-DR14): pública, a pessoa cria a senha. */}
      <Route path="/aceitar-convite" element={<AceitarConvite />} />
      {/* Definir nova senha por link de reset (1.9.01): pública, uso único/1h. */}
      <Route path="/definir-senha" element={<DefinirSenha />} />
      {/* Agendamento público por link (Story 5B.1): pública, sem login, por slug. */}
      <Route path="/agendar/:slug" element={<PublicAgendar />} />
      {/* Demo pública do Design System (Story 2.1) — para revisão visual. */}
      <Route path="/demo" element={<DesignSystemDemo />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Agenda />} />
        <Route
          path="/pendentes"
          element={
            <RequireManageAll>
              <Pendentes />
            </RequireManageAll>
          }
        />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClientePerfil />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/configuracoes" element={<Configuracoes />}>
          <Route index element={<Navigate to="identidade" replace />} />
          <Route path="identidade" element={<ConfiguracoesIdentidade />} />
          <Route path="servicos" element={<ConfiguracoesServicos />} />
          <Route path="horarios" element={<ConfiguracoesHorarios />} />
          <Route path="equipe" element={<ConfiguracoesEquipe />} />
          <Route path="link" element={<ConfiguracoesLinkPublico />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
