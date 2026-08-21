import { useState } from "react";
import { KeyRound, Moon, Sun, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useInstallation } from "../lib/useInstallation";
import { APP_VERSION } from "../lib/version";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageLayout } from "@/components/PageLayout";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { ChangelogDialog } from "@/components/ChangelogDialog";
import { CHANGELOG } from "../lib/changelog";

const ACCESS_LABEL: Record<string, string> = {
  owner: "Dono",
  professional: "Profissional",
};

/**
 * Perfil (Épico 7 / painel-mobile §4.4): destino do avatar do AppBar. Reúne o
 * que saiu do topo no mobile — identidade do estabelecimento, usuário, tema,
 * versão e Sair. Versão mínima da 1ª leva.
 */
export function Perfil() {
  const { user, setTheme, logout } = useAuth();
  const installation = useInstallation();
  const isDark = user?.theme === "dark";
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);

  return (
    <PageLayout title="Perfil" className="mx-auto max-w-lg">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {/* Identidade do estabelecimento */}
          <div className="flex items-center gap-3">
            {installation?.logoUrl ? (
              <img
                src={installation.logoUrl}
                alt={installation.name}
                className="size-11 rounded-xl object-cover"
              />
            ) : (
              <div className="grid size-11 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
                {(installation?.name ?? "T").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-semibold">{installation?.name ?? "Tamarcado"}</div>
              <div className="text-xs text-muted-foreground">Estabelecimento</div>
            </div>
          </div>

          {/* Usuário */}
          <div className="border-t border-border pt-3">
            <div className="font-medium">{user?.name}</div>
            <div className="text-sm text-muted-foreground">
              {user?.email}
              {user?.accessLevel ? ` · ${ACCESS_LABEL[user.accessLevel] ?? user.accessLevel}` : ""}
            </div>
          </div>

          {/* Tema */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Tema</span>
              <span className="text-sm text-muted-foreground">
                Atual: {isDark ? "Escuro" : "Claro"}
              </span>
            </div>
            <Button
              variant="secondary"
              onClick={() => void setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? (
                <Sun className="mr-2 size-4" aria-hidden="true" />
              ) : (
                <Moon className="mr-2 size-4" aria-hidden="true" />
              )}
              {isDark ? "Claro" : "Escuro"}
            </Button>
          </div>

          {/* Segurança — trocar a própria senha (sheet no mobile) */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Senha</span>
              <span className="text-sm text-muted-foreground">
                Troque a senha de acesso ao painel.
              </span>
            </div>
            <Button variant="secondary" onClick={() => setPwdOpen(true)}>
              <KeyRound className="mr-2 size-4" aria-hidden="true" />
              Trocar senha
            </Button>
          </div>

          {/* Sobre / versão (sai de cima do conteúdo no mobile) + Novidades */}
          <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="font-medium">Sobre</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNewsOpen(true)}
                className="text-primary hover:underline"
              >
                Novidades
              </button>
              <span className="text-muted-foreground">{APP_VERSION}</span>
            </div>
          </div>

          {/* Sair — ícone porta em vermelho (danger) + rótulo; ghost, mais leve
              que o destrutivo real "Cancelar agendamento" (§8.1). */}
          <button
            type="button"
            onClick={logout}
            aria-label="Sair"
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-md border border-border py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="size-4 text-destructive" aria-hidden="true" />
            Sair
          </button>
        </CardContent>
      </Card>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
      {/* Novidades — histórico de versões (reabre o aviso quando a pessoa quiser). */}
      <ChangelogDialog
        open={newsOpen}
        onClose={() => setNewsOpen(false)}
        entries={CHANGELOG}
        title="Novidades"
        closeLabel="Fechar"
      />
    </PageLayout>
  );
}
