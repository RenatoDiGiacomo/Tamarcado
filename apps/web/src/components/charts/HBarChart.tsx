interface Bar {
  label: string;
  value: number;
}

/**
 * Barras horizontais (Story 5.6) — ranking por magnitude (top clientes por
 * frequência). Medida única → um só matiz (`primary`); ordenado desc pelo pai;
 * rótulo de valor direto na ponta. HTML/flex (responsivo por natureza).
 */
export function HBarChart({
  items,
  unit,
}: {
  items: Bar[];
  unit?: string;
}) {
  const max = Math.max(1, ...items.map((b) => b.value));
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem atendimentos no período.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((b) => (
        <li key={b.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 truncate text-foreground" title={b.label}>
            {b.label}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.max(6, (b.value / max) * 100)}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right font-medium tabular-nums text-foreground">
              {b.value}
              {unit ? <span className="text-muted-foreground">{unit}</span> : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
