import { describe, it, expect } from "vitest";
import { maskBRL, brlToNumber, brl } from "./currency";

describe("currency (Story 5.2)", () => {
  it("maskBRL: dígitos são centavos, preenchendo da direita", () => {
    expect(maskBRL("5000")).toMatch(/R\$\s*50,00/);
    expect(maskBRL("50")).toMatch(/R\$\s*0,50/);
    expect(maskBRL("123456")).toMatch(/R\$\s*1\.234,56/);
    expect(maskBRL("")).toBe("");
    expect(maskBRL("abc")).toBe("");
  });

  it("brlToNumber: extrai o número do valor mascarado", () => {
    expect(brlToNumber("R$ 50,00")).toBe(50);
    expect(brlToNumber("R$ 1.234,56")).toBe(1234.56);
    expect(brlToNumber("")).toBe(0);
  });

  it("ida-e-volta: maskBRL ∘ brlToNumber preserva o valor", () => {
    expect(brlToNumber(maskBRL("5000"))).toBe(50);
    expect(brlToNumber(brl(120))).toBe(120);
  });
});
