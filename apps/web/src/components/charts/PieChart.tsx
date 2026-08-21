interface Segment {
  label: string;
  value: number;
  /** Classes Tailwind LITERAIS (JIT) — ex.: "fill-status-done" / "bg-status-done". */
  fillClass: string;
  dotClass: string;
}

const TAU = Math.PI * 2;

/**
 * Donut de composição (Story 5.6) — atendimentos por status. Usa a paleta de
 * STATUS do design system (reservada; nunca vira "série N"), sempre com legenda
 * (cor + rótulo + contagem) — identidade nunca só por cor. `<title>` por fatia.
 */
export function PieChart({ segments }: { segments: Segment[] }) {
  const parts = segments.filter((s) => s.value > 0);
  const total = parts.reduce((acc, s) => acc + s.value, 0);
  const R = 52;
  const r = 32; // furo do donut
  const cx = 60;
  const cy = 60;

  const point = (radius: number, angle: number): [number, number] => [
    cx + radius * Math.cos(angle),
    cy + radius * Math.sin(angle),
  ];

  let acc = -Math.PI / 2; // começa no topo
  const arcs = parts.map((s) => {
    const a0 = acc;
    const a1 = acc + (s.value / total) * TAU;
    acc = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [ox0, oy0] = point(R, a0);
    const [ox1, oy1] = point(R, a1);
    const [ix1, iy1] = point(r, a1);
    const [ix0, iy0] = point(r, a0);
    const d = `M ${ox0} ${oy0} A ${R} ${R} 0 ${large} 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix0} ${iy0} Z`;
    return { d, s };
  });

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label="Atendimentos por status" className="shrink-0">
        {total === 0 ? (
          <>
            <circle cx={cx} cy={cy} r={R} className="fill-muted" />
            <circle cx={cx} cy={cy} r={r} className="fill-background" />
          </>
        ) : parts.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={R} className={parts[0].fillClass} />
            <circle cx={cx} cy={cy} r={r} className="fill-background" />
          </>
        ) : (
          arcs.map((a, i) => (
            <path key={i} d={a.d} className={a.s.fillClass} stroke="hsl(var(--background))" strokeWidth={1.5}>
              <title>{`${a.s.label}: ${a.s.value}`}</title>
            </path>
          ))
        )}
      </svg>
      {/* Legenda: cor + rótulo + contagem (identidade nunca só por cor). */}
      <ul className="flex flex-col gap-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-full ${s.dotClass}`} aria-hidden="true" />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {s.value}
            </span>
          </li>
        ))}
        {total === 0 && (
          <li className="text-xs text-muted-foreground">Sem atendimentos no período.</li>
        )}
      </ul>
    </div>
  );
}
