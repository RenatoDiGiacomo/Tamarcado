import { Moon, Sun } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageLayout } from "@/components/PageLayout";

/** Tela de Perfil (restyle 2.1.02): dados do usuário + tema individual (AC3, Story 1.7). */
export function Perfil() {
  const { user, setTheme } = useAuth();
  const isDark = user?.theme === "dark";

  return (
    <PageLayout title="Perfil" className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{user?.name}</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Aparência</span>
            <span className="text-sm text-muted-foreground">
              Tema atual: {isDark ? "Escuro" : "Claro"}
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
            Alternar para {isDark ? "claro" : "escuro"}
          </Button>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
