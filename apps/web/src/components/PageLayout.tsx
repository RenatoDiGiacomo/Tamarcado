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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {action}
      </div>
      {children}
    </div>
  );
}
