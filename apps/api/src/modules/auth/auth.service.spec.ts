import * as bcrypt from "bcryptjs";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { User } from "../../database/entities/user.entity";

type Mocked = {
  svc: AuthService;
  users: { findByCompanyAndEmail: jest.Mock; findByIdUnscoped: jest.Mock };
  jwt: { sign: jest.Mock; verify: jest.Mock };
  companies: { findOne: jest.Mock; find: jest.Mock };
};

const company = { id: "1", slug: "salao-teste" };
const baseUser = {
  id: "10",
  company_id: "1",
  email: "dono@x.dev",
  password_hash: "",
  access_level: "owner" as const,
  attends_clients: true,
  is_active: true,
};

function make(opts: { allowSingleTenant?: boolean } = {}): Mocked {
  const users = {
    findByCompanyAndEmail: jest.fn(),
    findByIdUnscoped: jest.fn(),
  };
  const jwt = { sign: jest.fn().mockReturnValue("token"), verify: jest.fn() };
  const config = {
    get: jest.fn((k: string, d?: string) => {
      if (k === "AUTH_ALLOW_SINGLE_TENANT") return opts.allowSingleTenant ? "1" : undefined;
      return d ?? "cfg";
    }),
  };
  const companies = {
    findOne: jest.fn().mockResolvedValue(company),
    find: jest.fn().mockResolvedValue([company]),
  };
  const svc = new AuthService(
    users as never,
    jwt as never,
    config as never,
    companies as never,
  );
  return { svc, users, jwt, companies };
}

describe("AuthService", () => {
  it("validateUser retorna o usuário quando a senha bate", async () => {
    const { svc, users } = make();
    const hash = await bcrypt.hash("segredo", 10);
    users.findByCompanyAndEmail.mockResolvedValue({
      ...baseUser,
      password_hash: hash,
    });
    const result = await svc.validateUser("dono@x.dev", "segredo", "salao-teste");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("10");
  });

  it("validateUser retorna null com senha errada", async () => {
    const { svc, users } = make();
    const hash = await bcrypt.hash("segredo", 10);
    users.findByCompanyAndEmail.mockResolvedValue({
      ...baseUser,
      password_hash: hash,
    });
    expect(await svc.validateUser("dono@x.dev", "errada", "salao-teste")).toBeNull();
  });

  it("validateUser retorna null se o usuário está inativo", async () => {
    const { svc, users } = make();
    const hash = await bcrypt.hash("segredo", 10);
    users.findByCompanyAndEmail.mockResolvedValue({
      ...baseUser,
      password_hash: hash,
      is_active: false,
    });
    expect(await svc.validateUser("dono@x.dev", "segredo", "salao-teste")).toBeNull();
  });

  it("validateUser exige companySlug quando há múltiplas instalações", async () => {
    const { svc, companies } = make();
    companies.find.mockResolvedValue([company, { id: "2", slug: "outro" }]);
    await expect(svc.validateUser("dono@x.dev", "segredo")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("validateUser sem slug → 401 mesmo com 1 empresa quando a flag está OFF (contrato de produção, DL-050)", async () => {
    const { svc, companies } = make(); // AUTH_ALLOW_SINGLE_TENANT off
    companies.find.mockResolvedValue([company]);
    await expect(svc.validateUser("dono@x.dev", "segredo")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("validateUser sem slug resolve a única empresa quando AUTH_ALLOW_SINGLE_TENANT está ON (dev)", async () => {
    const { svc, users } = make({ allowSingleTenant: true });
    const hash = await bcrypt.hash("segredo", 10);
    users.findByCompanyAndEmail.mockResolvedValue({ ...baseUser, password_hash: hash });
    const result = await svc.validateUser("dono@x.dev", "segredo");
    expect(result?.id).toBe("10");
  });

  it("validateUser com slug inexistente → 401 (sem 500, sem enumeração)", async () => {
    const { svc, companies } = make();
    companies.findOne.mockResolvedValue(null);
    await expect(
      svc.validateUser("dono@x.dev", "segredo", "nao-existe"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("login assina access e refresh tokens", () => {
    const { svc, jwt } = make();
    const tokens = svc.login(baseUser as unknown as User);
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(jwt.sign).toHaveBeenCalledTimes(2);
  });

  it("refresh emite novo access a partir de refresh válido", async () => {
    const { svc, jwt, users } = make();
    jwt.verify.mockReturnValue({ sub: "10" });
    users.findByIdUnscoped.mockResolvedValue(baseUser);
    const result = await svc.refresh("valid-refresh");
    expect(result.accessToken).toBeDefined();
  });

  it("refresh rejeita refresh inválido com 401", async () => {
    const { svc, jwt } = make();
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid");
    });
    await expect(svc.refresh("bad")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
