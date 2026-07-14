import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PageLayout } from "@/components/PageLayout";
import { ConfiguracoesTabs } from "@/components/ConfiguracoesTabs";

/**
 * Casca da seção Configurações (owner-only): título + abas horizontais + a aba
 * ativa via `<Outlet/>`. O item "Configurações" no shell já é owner-only; aqui
 * a rota também redireciona quem não for Dono.
 */
export function Configuracoes() {
  const { user } = useAuth();
  if (user && user.accessLevel !== "owner") {
    return <Navigate to="/" replace />;
  }
  return (
    <PageLayout title="Configurações">
      <ConfiguracoesTabs />
      <Outlet />
    </PageLayout>
  );
}
