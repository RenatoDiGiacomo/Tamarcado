import { TenantContextService } from "./tenant-context.service";

describe("TenantContextService", () => {
  const ctx = new TenantContextService();

  it("getCompanyId retorna o valor dentro de run()", () => {
    ctx.run("42", () => {
      expect(ctx.getCompanyId()).toBe("42");
      expect(ctx.getCompanyIdOrNull()).toBe("42");
    });
  });

  it("getCompanyId lança fora de run()", () => {
    expect(() => ctx.getCompanyId()).toThrow();
    expect(ctx.getCompanyIdOrNull()).toBeNull();
  });

  it("isola contextos aninhados por tenant", () => {
    ctx.run("A", () => {
      expect(ctx.getCompanyId()).toBe("A");
      ctx.run("B", () => {
        expect(ctx.getCompanyId()).toBe("B");
      });
      expect(ctx.getCompanyId()).toBe("A");
    });
  });
});
