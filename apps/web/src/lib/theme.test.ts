import { describe, it, expect } from "vitest";
import { hexToHslTriplet } from "./theme";

describe("hexToHslTriplet", () => {
  it("converte branco e preto", () => {
    expect(hexToHslTriplet("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslTriplet("#000000")).toBe("0 0% 0%");
  });

  it("converte a cor primária padrão (#6C63FF)", () => {
    // indigo saturado → 243°, 100%, 69%
    expect(hexToHslTriplet("#6C63FF")).toBe("243 100% 69%");
  });

  it("aceita sem '#' e é case-insensitive", () => {
    expect(hexToHslTriplet("E91E63")).toMatch(/^\d+ \d+% \d+%$/);
  });

  it("retorna null para valores inválidos", () => {
    expect(hexToHslTriplet("roxo")).toBeNull();
    expect(hexToHslTriplet("#12")).toBeNull();
    expect(hexToHslTriplet("")).toBeNull();
  });
});
