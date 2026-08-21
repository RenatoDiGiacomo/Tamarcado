import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/info-tip";
import { useIsDesktop } from "@/lib/useMediaQuery";

/** Um cartão de indicador — o mesmo dado no celular e no PC, só que menor lá. */
export interface StatItem {
  key: string;
  label: string;
  value: string;
  /** Borda esquerda (token de status). Padrão: `border-l-primary`. */
  accentClass?: string;
  /** Cor do valor (token de status). Padrão: `text-foreground`. */
  valueClass?: string;
  /** Segunda linha, menor (ex.: "A receber: R$ 20,00"). */
  hint?: string;
  /** Significado + cálculo (Story 5.6). Sem isto o cartão não ganha o "i". */
  info?: string;
  /** Lado de abertura do balão no desktop (evita cortar na borda da grade). */
  infoAlign?: "left" | "right";
}

/**
 * Faixa de indicadores.
 *
 * **Desktop (md+):** exatamente a grade de cartões de sempre — o `gridClassName`
 * é quem define as colunas de cada tela, então nada muda no PC.
 *
 * **Mobile:** os mesmos cartões, menores, em ROLAGEM HORIZONTAL com encaixe
 * (snap) — o padrão de carrossel que a usuária já conhece de rede social.
 * Empilhados, oito indicadores empurravam o gráfico para duas telas abaixo.
 *
 * O "tem mais para o lado" é dito de duas formas, porque só uma não basta:
 * o próximo cartão fica **cortado na borda** (a tela deixa de parecer completa)
 * e os **pontinhos** embaixo mostram quantos são e onde você está.
 *
 * A dica (i) do celular abre num bloco ABAIXO da faixa, não dentro do cartão:
 * o container de rolagem recorta o que passa da borda, então um balão absoluto
 * sairia cortado — além de não caber num cartão de 140px.
 */
export function StatStrip({
  items,
  gridClassName,
  valueSize = "lg",
  label,
}: {
  items: StatItem[];
  /** Colunas do desktop (ex.: "md:grid-cols-3 lg:grid-cols-4"). */
  gridClassName?: string;
  valueSize?: "lg" | "xl";
  /** Nome da região para leitor de tela (ex.: "Indicadores do período"). */
  label: string;
}) {
  const isDesktop = useIsDesktop();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  const valueCls = valueSize === "xl" ? "text-xl" : "text-lg";

  if (isDesktop) {
    return (
      <div className={cn("grid grid-cols-2 gap-3", gridClassName)}>
        {items.map((it) => (
          <div
            key={it.key}
            className={cn(
              "rounded-lg border border-l-4 border-border bg-card p-4",
              it.accentClass ?? "border-l-primary",
            )}
          >
            <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>{it.label}</span>
              {it.info ? (
                <InfoTip
                  text={it.info}
                  label={`O que é ${it.label}?`}
                  align={it.infoAlign}
                />
              ) : null}
            </div>
            <div
              className={cn(
                "mt-1 font-semibold tabular-nums",
                valueCls,
                it.valueClass ?? "text-foreground",
              )}
            >
              {it.value}
            </div>
            {it.hint ? (
              <div className="mt-1 text-xs text-muted-foreground">{it.hint}</div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  // Qual cartão está encaixado agora — medido pela distância até o primeiro,
  // que já desconta o padding da faixa (não depende de largura fixa).
  function handleScroll(): void {
    const el = scrollerRef.current;
    const cards = el ? (Array.from(el.children) as HTMLElement[]) : [];
    if (!el || cards.length === 0) return;
    // No fim da rolagem o cartão encostado na borda esquerda ainda é o
    // penúltimo (os dois últimos cabem juntos) — sem isto o último ponto nunca
    // acenderia e a faixa pareceria ter um indicador a mais do que dá para ver.
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) {
      setActive(cards.length - 1);
      return;
    }
    const origin = cards[0].offsetLeft;
    let nearest = 0;
    let best = Infinity;
    cards.forEach((card, i) => {
      const distance = Math.abs(card.offsetLeft - origin - el.scrollLeft);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    setActive(nearest);
  }

  const open = items.find((it) => it.key === openInfo);

  return (
    <div>
      {/* -mx-4/px-4: sangra até as bordas da tela (o `main` do mobile tem px-4),
          para o cartão cortado encostar na borda em vez de flutuar. */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] focus-visible:outline-none [&::-webkit-scrollbar]:[display:none]"
      >
        {items.map((it) => (
          <div
            key={it.key}
            className={cn(
              "w-[40vw] min-w-[8.75rem] max-w-[10.5rem] shrink-0 snap-start rounded-lg border border-l-4 border-border bg-card p-3",
              it.accentClass ?? "border-l-primary",
            )}
          >
            <div className="flex items-start gap-1 text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
              <span>{it.label}</span>
              {it.info ? (
                <button
                  type="button"
                  aria-label={`O que é ${it.label}?`}
                  aria-expanded={openInfo === it.key}
                  onClick={() =>
                    setOpenInfo((cur) => (cur === it.key ? null : it.key))
                  }
                  className="shrink-0 text-muted-foreground/70"
                >
                  <Info className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div
              className={cn(
                "mt-1 text-base font-semibold tabular-nums",
                it.valueClass ?? "text-foreground",
              )}
            >
              {it.value}
            </div>
            {it.hint ? (
              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                {it.hint}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Pontinhos: quantos indicadores existem e onde você está entre eles.
          Decorativos — quem usa leitor de tela navega pela faixa, não por eles. */}
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
        {items.map((it, i) => (
          <span
            key={it.key}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              i === active ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>

      {open ? (
        <p
          role="note"
          className="mt-2 rounded-md border border-border bg-card p-2.5 text-xs leading-snug text-muted-foreground"
        >
          <strong className="font-medium text-foreground">{open.label}:</strong>{" "}
          {open.info}
        </p>
      ) : null}
    </div>
  );
}
