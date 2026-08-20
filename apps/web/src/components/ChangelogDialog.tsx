import { Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { displayVersion, type ChangelogEntry } from "../lib/changelog";

const brDate = (d: string) => d.split("-").reverse().join("/");

/**
 * Diálogo de novidades (aviso de atualização). Mostra uma ou várias versões, em
 * linguagem de quem usa. Usado no aviso automático (versão atual) e no histórico
 * do Perfil (todas). O texto vem do `lib/changelog.ts`.
 */
export function ChangelogDialog({
  open,
  onClose,
  entries,
  title,
  closeLabel = "Entendi",
}: {
  open: boolean;
  onClose: () => void;
  entries: ChangelogEntry[];
  title: string;
  closeLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
          {entries.map((e) => (
            <section key={e.version} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {displayVersion(e.version)}
                </span>
                <span className="text-xs text-muted-foreground">{brDate(e.date)}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {e.items.map((it, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <Button onClick={onClose}>{closeLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
