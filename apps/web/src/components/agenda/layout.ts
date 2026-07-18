/** Layout de colisão da agenda (padrão Google Calendar): agendamentos que se
 *  sobrepõem no tempo dividem a largura em colunas lado a lado. Função pura,
 *  testável. Consequência do overbooking liberado na 3.3 (D1) — a agenda precisa
 *  saber desenhar dois agendamentos no mesmo horário. */

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export interface Placed<T> {
  item: T;
  /** Índice da coluna (0-based) dentro do grupo de sobreposição. */
  col: number;
  /** Total de colunas do grupo — largura de cada card = 1/cols. */
  cols: number;
}

/**
 * Distribui os itens em colunas de forma que nenhum par sobreposto ocupe a mesma
 * coluna. Itens sem sobreposição usam a largura toda (`cols = 1`). Um "grupo" é um
 * conjunto de itens conectados por sobreposição; `cols` = nº de colunas do grupo.
 */
export function packColumns<T extends { start: string; end: string }>(
  items: T[],
): Placed<T>[] {
  const sorted = [...items].sort(
    (a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end),
  );
  const placed: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let colEnds: number[] = []; // fim (min) do último item de cada coluna do grupo
  let groupEnd = -Infinity; // maior fim do grupo atual

  const closeGroup = (): void => {
    const cols = colEnds.length;
    for (const p of group) p.cols = cols;
    group = [];
    colEnds = [];
    groupEnd = -Infinity;
  };

  for (const it of sorted) {
    const s = toMin(it.start);
    const e = toMin(it.end);
    // Começa depois do fim de tudo no grupo → não sobrepõe nada → novo grupo.
    if (colEnds.length > 0 && s >= groupEnd) closeGroup();

    // Primeira coluna livre (cujo último item termina em/antes de `s`).
    let col = colEnds.findIndex((end) => end <= s);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(e);
    } else {
      colEnds[col] = e;
    }

    const p: Placed<T> = { item: it, col, cols: 1 };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, e);
  }
  if (group.length > 0) closeGroup();

  return placed;
}
