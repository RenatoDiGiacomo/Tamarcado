import * as bcrypt from "bcryptjs";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService, AuthTokens } from "./auth.service";
import type { User } from "../../database/entities/user.entity";

type Mocked = {
  svc: AuthService;
  users: {
    findByCompanyAndEmail: jest.Mock;
    findActiveByEmail: jest.Mock;
    findByIdUnscoped: jest.Mock;
  };
  tokens: { issue: jest.Mock; signAccess: jest.Mock; verifyRefresh: jest.Mock };
  companies: { findOne: jest.Mock; find: jest.Mock };
};

const baseUser = {
  id: "10",
  company_id: "1",
  email: "dono@x.dev",
  password_hash: "",
  access_level: "owner" as const,
  attends_clients: true,
  is_active: true,
  token_version: 0,
};

function make(): Mocked {
  const users = {
    findByCompanyAndEmail: jest.fn(),
    findActiveByEmail: jest.fn().mockResolvedValue([]),
    findByIdUnscoped: jest.fn(),
  };
  const tokens = {
    issue: jest
      .fn()
      .mockReturnValue({ accessToken: "acc", refreshToken: "ref" }),
    signAccess: jest.fn().mockReturnValue("acc"),
    verifyRefresh: jest.fn(),
  };
  const companies = { findOne: jest.fn(), find: jest.fn() };
  const svc = new AuthService(users as never, tokens as never, companies as never);
  return { svc, users, tokens, companies };
}

async function userWith(password: string, over: Partial<User> = {}) {
  return { ...baseUser, password_hash: await bcrypt.hash(password, 10), ...over };
}
const isTokens = (o: unknown): o is AuthTokens =>
  typeof o === "object" && o !== null && "accessToken" in o;

describe("AuthService.attemptLogin (login por e-mail — DL-052)", () => {
  it("e-mail em UMA empresa + senha certa → tokens", async () => {
    const { svc, users } = make();
    users.findActiveByEmail.mockResolvedValue([await userWith("segredo")]);
    const out = await svc.attemptLogin("dono@x.dev", "segredo");
    expect(isTokens(out)).toBe(true);
  });

  it("e-mail em UMA empresa + senha errada → 401", async () => {
    const { svc, users } = make();
    users.findActiveByEmail.mockResolvedValue([await userWith("segredo")]);
    await expect(svc.attemptLogin("dono@x.dev", "errada")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("e-mail inexistente/inativo (nenhum ativo) → 401 (sem revelar existência)", async () => {
    const { svc, users } = make();
    users.findActiveByEmail.mockResolvedValue([]); // inativo é filtrado no lookup
    await expect(svc.attemptLogin("some@x.dev", "x")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("e-mail em DUAS empresas → devolve a lista para escolha, SEM validar senha", async () => {
    const { svc, users, companies } = make();
    users.findActiveByEmail.mockResolvedValue([
      { ...baseUser, company_id: "1" },
      { ...baseUser, id: "11", company_id: "2" },
    ]);
    companies.find.mockResolvedValue([
      { id: "2", name: "Salão B" },
      { id: "1", name: "Salão A" },
    ]);
    const out = await svc.attemptLogin("dono@x.dev", "qualquer");
    expect(isTokens(out)).toBe(false);
    // Ordenado por nome; senha nem foi consultada (findByCompanyAndEmail intocado).
    expect(out).toEqual({
      companies: [
        { id: "1", name: "Salão A" },
        { id: "2", name: "Salão B" },
      ],
    });
    expect(users.findByCompanyAndEmail).not.toHaveBeenCalled();
  });

  it("escolha (companyId) + senha certa → tokens no tenant escolhido", async () => {
    const { svc, users } = make();
    users.findByCompanyAndEmail.mockResolvedValue(await userWith("segredo"));
    const out = await svc.attemptLogin("dono@x.dev", "segredo", "1");
    expect(isTokens(out)).toBe(true);
    expect(users.findByCompanyAndEmail).toHaveBeenCalledWith("1", "dono@x.dev");
    expect(users.findActiveByEmail).not.toHaveBeenCalled();
  });

  it("escolha (companyId) + senha errada → 401", async () => {
    const { svc, users } = make();
    users.findByCompanyAndEmail.mockResolvedValue(await userWith("segredo"));
    await expect(
      svc.attemptLogin("dono@x.dev", "errada", "1"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("escolha (companyId) onde o e-mail não existe → 401", async () => {
    const { svc, users } = make();
    users.findByCompanyAndEmail.mockResolvedValue(null);
    await expect(
      svc.attemptLogin("dono@x.dev", "segredo", "999"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("usuário inativo no tenant escolhido → 401", async () => {
    const { svc, users } = make();
    users.findByCompanyAndEmail.mockResolvedValue(
      await userWith("segredo", { is_active: false }),
    );
    await expect(
      svc.attemptLogin("dono@x.dev", "segredo", "1"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("AuthService tokens/refresh", () => {
  it("login delega a emissão dos tokens ao TokenService", () => {
    const { svc, tokens } = make();
    const out = svc.login(baseUser as unknown as User);
    expect(out).toEqual({ accessToken: "acc", refreshToken: "ref" });
    expect(tokens.issue).toHaveBeenCalledWith(baseUser);
  });

  it("refresh emite novo access quando a versão do token bate", async () => {
    const { svc, tokens, users } = make();
    tokens.verifyRefresh.mockReturnValue({ sub: "10", tokenVersion: 0 });
    users.findByIdUnscoped.mockResolvedValue({ ...baseUser, token_version: 0 });
    const result = await svc.refresh("valid-refresh");
    expect(result.accessToken).toBe("acc");
    expect(tokens.signAccess).toHaveBeenCalled();
  });

  it("refresh rejeita quando a versão do token não bate (senha trocada, 1.2.04)", async () => {
    const { svc, tokens, users } = make();
    tokens.verifyRefresh.mockReturnValue({ sub: "10", tokenVersion: 0 });
    users.findByIdUnscoped.mockResolvedValue({ ...baseUser, token_version: 1 });
    await expect(svc.refresh("stale")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("refresh rejeita usuário inativo com 401", async () => {
    const { svc, tokens, users } = make();
    tokens.verifyRefresh.mockReturnValue({ sub: "10", tokenVersion: 0 });
    users.findByIdUnscoped.mockResolvedValue({
      ...baseUser,
      is_active: false,
    });
    await expect(svc.refresh("x")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refresh rejeita refresh inválido com 401", async () => {
    const { svc, tokens } = make();
    tokens.verifyRefresh.mockImplementation(() => {
      throw new Error("invalid");
    });
    await expect(svc.refresh("bad")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
