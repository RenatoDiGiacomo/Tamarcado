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
      }),
    ).toEqual({
      userId: "10",
      companyId: "1",
      accessLevel: "owner",
      attendsClients: true,
    });
  });
});
