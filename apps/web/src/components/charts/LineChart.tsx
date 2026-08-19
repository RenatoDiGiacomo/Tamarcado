interface Point {
  label: string;
  value: number;
}

/**
 * Linha de série única (Story 5.6) — faturamento no tempo. SVG responsivo
 * (viewBox + `non-scaling-stroke`: a linha fica 2px em qualquer largura). Série
 * única → sem legenda (o título nomeia); rótulos de eixo seletivos; `<title>` por
 * ponto como tooltip nativo. Cor pelo token `primary` (tema/instalação).
 */
export function LineChart({
  data,
  formatValue,
  height = 180,
}: {
  data: Point[];
  formatValue: (n: number) => string;
  height?: number;
}) {
  const W = 600;
  const H = height;
  const padX = 8;
  const padTop = 12;
  const padBottom = 22;
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const n = data.length;
  const x = (i: number) => (n <= 1 ? padX + innerW / 2 : padX + (innerW * i) / (n - 1));
  const y = (v: number) => padTop + innerH - (v / max) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
    .join(" ");
  const areaPath =
    n > 0
      ? `${linePath} L ${x(n - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`
      : "";

  // Rótulos de eixo X seletivos: primeiro, meio e último (evita colisão).
  const tickIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  const empty = data.every((d) => d.value === 0);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="Faturamento no período"
        className="overflow-visible"
      >
        {/* Grade horizontal recessiva (3 linhas). */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={W - padX}
            y1={padTop + innerH * t}
            y2={padTop + innerH * t}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {!empty && (
          <>
            <path d={areaPath} className="fill-primary/10" />
            <path
              d={linePath}
              className="stroke-primary"
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {data.map((d, i) => (
              <circle
                key={i}
                cx={x(i)}
                cy={y(d.value)}
                r={n > 40 ? 0 : 3}
                className="fill-primary"
              >
                <title>{`${d.label}: ${formatValue(d.value)}`}</title>
              </circle>
            ))}
          </>
        )}
        {/* Rótulos de eixo X. */}
        {tickIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            className="fill-muted-foreground text-[10px]"
          >
            {data[i]?.label}
          </text>
        ))}
      </svg>
      {empty && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Sem faturamento no período.
        </p>
      )}
    </div>
  );
}
