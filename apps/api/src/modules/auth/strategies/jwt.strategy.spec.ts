import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  const config = { get: () => "secret" } as never;

  it("validate mapeia o payload do token para AuthUser", () => {
    const strategy = new JwtStrategy(config);
    expect(
      strategy.validate({
        sub: "10",
        companyId: "1",
        accessLevel: "owner",
        attendsClients: true,
        tokenVersion: 3,
      }),
    ).toEqual({
      userId: "10",
      companyId: "1",
      accessLevel: "owner",
      attendsClients: true,
      tokenVersion: 3,
    });
  });

  it("token sem tokenVersion (pré-1.2.04) → 0", () => {
    const strategy = new JwtStrategy(config);
    expect(
      strategy.validate({
        sub: "10",
        companyId: "1",
        accessLevel: "owner",
        attendsClients: true,
      }),
    ).toMatchObject({ tokenVersion: 0 });
  });
});
