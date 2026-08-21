import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { APP_VERSION_RAW } from "../lib/version";
import {
  entryFor,
  lastSeenVersion,
  markVersionSeen,
} from "../lib/changelog";
import { ChangelogDialog } from "./ChangelogDialog";

/**
 * Aviso de atualização (feature): DEPOIS do login, se a versão do sistema mudou
 * desde o último acesso deste usuário (neste navegador), mostra UMA VEZ as
 * novidades da versão atual — conteúdo do `lib/changelog.ts`. Ao fechar, marca a
 * versão como vista (não volta). O "já vi" é por usuário e por versão (localStorage);
 * trocar de aparelho pode mostrar de novo — aceitável (sem complexidade extra).
 */
export function ChangelogNotice() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const entry = entryFor(APP_VERSION_RAW);
    // Só mostra se há novidades para a versão atual e o usuário ainda não a viu.
    if (entry && lastSeenVersion(user.id) !== APP_VERSION_RAW) {
      setOpen(true);
    }
  }, [user]);

  const entry = entryFor(APP_VERSION_RAW);
  if (!user || !entry) return null;

  return (
    <ChangelogDialog
      open={open}
      onClose={() => {
        markVersionSeen(user.id, APP_VERSION_RAW);
        setOpen(false);
      }}
      entries={[entry]}
      title="Novidades desta atualização"
    />
  );
}
