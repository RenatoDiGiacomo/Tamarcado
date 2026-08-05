import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Moldura de tela: título + ação à direita + conteúdo. */
export function PageLayout({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* No mobile o título vive na AppBar (Épico 7); aqui só aparece no desktop,
          para não duplicar. Sem ação, a linha some no mobile (evita espaço vazio);
          com ação, a linha aparece (a ação é útil no celular). */}
      <div
        className={cn(
          "items-center justify-between gap-4",
          action ? "flex" : "hidden md:flex",
        )}
      >
        <h1 className="hidden text-2xl font-semibold text-foreground md:block">
          {title}
        </h1>
        {action}
      </div>
      {children}
    </div>
  );
}
