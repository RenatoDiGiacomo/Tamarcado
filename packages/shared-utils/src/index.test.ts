import { describe, it, expect } from "vitest";
import { isBlank } from "./index";

describe("isBlank", () => {
  it("retorna true para null, undefined e string vazia", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("")).toBe(true);
  });

  it("retorna true para string só com espaços", () => {
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("\t\n")).toBe(true);
  });

  it("retorna false para string com conteúdo", () => {
    expect(isBlank("a")).toBe(false);
    expect(isBlank("  x  ")).toBe(false);
  });
});
