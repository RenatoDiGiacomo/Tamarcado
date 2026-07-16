import { normalizePhoneBR } from "./phone.util";

describe("normalizePhoneBR", () => {
  it("retorna null para vazio/nulo (cliente sem WhatsApp)", () => {
    expect(normalizePhoneBR(null)).toBeNull();
    expect(normalizePhoneBR(undefined)).toBeNull();
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("   ")).toBeNull();
  });

  it("prefixa +55 em número nacional (DDD + 9 dígitos)", () => {
    expect(normalizePhoneBR("(11) 99999-8888")).toBe("+5511999998888");
    expect(normalizePhoneBR("11999998888")).toBe("+5511999998888");
  });

  it("prefixa +55 em número nacional fixo (DDD + 8 dígitos)", () => {
    expect(normalizePhoneBR("1133334444")).toBe("+551133334444");
  });

  it("preserva quando já vem com código do país 55", () => {
    expect(normalizePhoneBR("+55 11 99999-8888")).toBe("+5511999998888");
    expect(normalizePhoneBR("5511999998888")).toBe("+5511999998888");
  });

  it("normaliza formatações diferentes do MESMO número para a mesma string (dedup)", () => {
    const a = normalizePhoneBR("(11) 99999-8888");
    const b = normalizePhoneBR("11 99999 8888");
    const c = normalizePhoneBR("+55 (11) 99999-8888");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
