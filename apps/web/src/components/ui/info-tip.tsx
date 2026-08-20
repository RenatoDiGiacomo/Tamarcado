import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dica explicativa (Story 5.6): ícone "i" que revela um texto curto — o que o
 * dado significa e como é calculado. Abre no HOVER (desktop) e no CLIQUE (mobile,
 * onde não há hover); fecha ao clicar fora ou com Esc. Sem dependência nova.
 */
export function InfoTip({
  text,
  label = "O que é isto?",
  align = "left",
}: {
  text: string;
  label?: string;
  /** Lado para onde o balão se abre (evita cortar na borda). */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-muted-foreground/70 transition-colors hover:text-foreground focus:text-foreground focus:outline-none"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span
          role="note"
          className={cn(
            "absolute top-full z-50 mt-1 w-56 rounded-md border border-border bg-card p-2.5 text-xs font-normal normal-case leading-snug tracking-normal text-muted-foreground shadow-md",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}
