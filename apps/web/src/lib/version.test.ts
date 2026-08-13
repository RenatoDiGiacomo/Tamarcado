import { describe, it, expect } from "vitest";
import { formatVersion } from "./version";

describe("formatVersion — rótulo exibido na UI (DL-063)", () => {
  it('beta .0 fica limpo: "1.0.0-beta" -> "v1.0b"', () => {
    expect(formatVersion("1.0.0-beta")).toBe("v1.0b");
  });

  it('PATCH > 0 aparece (correção visível): "1.0.1-beta" -> "v1.0.1b"', () => {
    expect(formatVersion("1.0.1-beta")).toBe("v1.0.1b");
  });

  it('MINOR zera o patch no rótulo: "1.1.0-beta" -> "v1.1b"', () => {
    expect(formatVersion("1.1.0-beta")).toBe("v1.1b");
  });

  it('estável (sem -beta) perde o "b": "1.0.0" -> "v1.0"', () => {
    expect(formatVersion("1.0.0")).toBe("v1.0");
  });

  it('estável com patch: "1.2.3" -> "v1.2.3"', () => {
    expect(formatVersion("1.2.3")).toBe("v1.2.3");
  });

  it("pré-lançamento não-beta aparece por extenso", () => {
    expect(formatVersion("2.0.0-rc1")).toBe("v2.0-rc1");
  });
});
