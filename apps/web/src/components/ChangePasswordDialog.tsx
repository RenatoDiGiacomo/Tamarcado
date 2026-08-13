import { useState } from "react";
import { toast } from "sonner";
import { authedRequest } from "../lib/session";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

// Mesma política do cadastro/convite (accept-invite.dto): mínimo 8 caracteres.
const MIN = 8;

/** Mensagem real da API (Nest `{ message }`), com fallback. */
async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string | string[] };
    const m = b?.message;
    if (Array.isArray(m) && m.length > 0) return m.join(" · ");
    if (typeof m === "string" && m.trim() !== "") return m;
  } catch {
    /* sem corpo */
  }
  return fallback;
}

/**
 * Troca de senha (Perfil). Sheet no mobile / diálogo no desktop (DialogContent
 * responsivo). Valida a senha atual no backend; a nova segue a política do
 * cadastro (mín. 8). A troca REVOGA as outras sessões (1.2.04): a API devolve
 * tokens novos e ESTA sessão os adota (`applySession`) para não cair — se
 * mantivéssemos os tokens antigos, a versão de sessão já não bateria e a
 * próxima requisição daria 401.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { applySession } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset(): void {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setSaving(false);
  }

  async function submit(): Promise<void> {
    setError(null);
    if (next.length < MIN) {
      setError(`A nova senha deve ter pelo menos ${MIN} caracteres.`);
      return;
    }
    if (next !== confirm) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setSaving(true);
    const res = await authedRequest("/users/me/password", {
      method: "PATCH",
      body: { currentPassword: current, newPassword: next } ,
    });
    if (!res.ok) {
      setError(await apiError(res, "Não foi possível trocar a senha."));
      setSaving(false);
      return;
    }
    // Adota os tokens novos (versão de sessão nova) para esta sessão seguir
    // válida; sem isso, os tokens antigos seriam revogados na próxima chamada.
    const { accessToken, refreshToken } = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    await applySession(accessToken, refreshToken);
    reset();
    onOpenChange(false);
    toast.success("Senha alterada.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar senha</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cur-pass">Senha atual</Label>
            <Input
              id="cur-pass"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pass">Nova senha</Label>
            <Input
              id="new-pass"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Pelo menos {MIN} caracteres.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-pass">Confirmar nova senha</Label>
            <Input
              id="confirm-pass"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !current || !next || !confirm}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
