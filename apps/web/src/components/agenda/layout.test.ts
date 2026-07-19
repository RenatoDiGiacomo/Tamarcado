import { describe, it, expect } from "vitest";
import { packColumns } from "./layout";

type Ev = { id: string; start: string; end: string };
const ev = (id: string, start: string, end: string): Ev => ({ id, start, end });

/** Mapa id → {col, cols} para asserção legível. */
function layout(items: Ev[]): Record<string, { col: number; cols: number }> {
  const out: Record<string, { col: number; cols: number }> = {};
  for (const p of packColumns(items)) out[p.item.id] = { col: p.col, cols: p.cols };
  return out;
}

describe("packColumns", () => {
  it("sem sobreposição → largura total (cols=1)", () => {
    const m = layout([ev("a", "09:00", "10:00"), ev("b", "10:00", "11:00")]);
    expect(m.a).toEqual({ col: 0, cols: 1 });
    expect(m.b).toEqual({ col: 0, cols: 1 });
  });

  it("dois no mesmo horário → 2 colunas lado a lado", () => {
    const m = layout([ev("a", "10:00", "11:00"), ev("b", "10:00", "11:00")]);
    expect(m.a).toEqual({ col: 0, cols: 2 });
    expect(m.b).toEqual({ col: 1, cols: 2 });
  });

  it("três concorrentes → 3 colunas", () => {
    const m = layout([
      ev("a", "10:00", "11:00"),
      ev("b", "10:00", "11:00"),
      ev("c", "10:00", "11:00"),
    ]);
    expect(m.a.cols).toBe(3);
    expect(m.b.cols).toBe(3);
    expect(m.c.cols).toBe(3);
    expect(new Set([m.a.col, m.b.col, m.c.col])).toEqual(new Set([0, 1, 2]));
  });

  it("cadeia parcial reaproveita coluna livre", () => {
    // a[09-10], b[09:30-10:30], c[10-11]: c não sobrepõe a → reusa col0; grupo=2 cols
    const m = layout([
      ev("a", "09:00", "10:00"),
      ev("b", "09:30", "10:30"),
      ev("c", "10:00", "11:00"),
    ]);
    expect(m.a).toEqual({ col: 0, cols: 2 });
    expect(m.b).toEqual({ col: 1, cols: 2 });
    expect(m.c).toEqual({ col: 0, cols: 2 });
  });

  it("separa grupos independentes (cols por grupo)", () => {
    // par sobreposto de manhã (2 cols) + um isolado à tarde (1 col)
    const m = layout([
      ev("a", "09:00", "10:00"),
      ev("b", "09:00", "10:00"),
      ev("c", "14:00", "15:00"),
    ]);
    expect(m.a.cols).toBe(2);
    expect(m.b.cols).toBe(2);
    expect(m.c).toEqual({ col: 0, cols: 1 });
  });

  it("encostar (fim == início) não conta como sobreposição", () => {
    const m = layout([ev("a", "09:00", "09:15"), ev("b", "09:15", "09:30")]);
    expect(m.a).toEqual({ col: 0, cols: 1 });
    expect(m.b).toEqual({ col: 0, cols: 1 });
  });
});
