import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { UserInvite } from "../src/database/entities/user-invite.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Reset de senha por link (1.9.01), endpoint de plataforma. O operador gera o
 * link (x-platform-key); o dono define a própria senha; link de uso único e
 * expira em 1h; gerar um novo invalida o anterior.
 */
jest.setTimeout(60000);

const PLATFORM_KEY = "test-platform-key-1234";
process.env.PLATFORM_KEY = PLATFORM_KEY;

describe("Reset de senha por link (e2e)", () => {
  let ctx: E2EContext;
  const OLD = "senha-antiga";
  const SLUG = "salao-reset";
  const EMAIL = "dono@reset.dev";
  const api = () => request(ctx.app.getHttpServer());

  const genReset = (body: object, key: string | null = PLATFORM_KEY) => {
    const req = api().post("/api/platform/password-reset");
    if (key !== null) req.set("x-platform-key", key);
    return req.send(body);
  };
  const tokenOf = (url: string): string =>
    new URL(url).searchParams.get("token") as string;
  const setPassword = (token: string, password: string) =>
    api().post("/api/auth/accept-invite").send({ token, password });
  const login = (password: string) =>
    api()
      .post("/api/auth/login")
      .send({ email: EMAIL, password, companySlug: SLUG });

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const company = await ctx.dataSource
      .getRepository(Company)
      .save(ctx.dataSource.getRepository(Company).create({ name: "S", slug: SLUG }));
    await ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        company_id: company.id,
        name: "Dono",
        email: EMAIL,
        password_hash: await bcrypt.hash(OLD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
  });
  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("gera link (201) → dono define a nova senha e entra; a antiga não vale mais", async () => {
    const res = await genReset({ slug: SLUG, email: EMAIL }).expect(201);
    expect(res.body.resetUrl).toMatch(/\/definir-senha\?token=/);

    await setPassword(tokenOf(res.body.resetUrl), "novaSenha1").expect(200);
    await login("novaSenha1").expect(200); // nova vale
    await login(OLD).expect(401); // antiga não
  });

  it("link é de USO ÚNICO — usar de novo → 400", async () => {
    const res = await genReset({ slug: SLUG, email: EMAIL }).expect(201);
    const token = tokenOf(res.body.resetUrl);
    await setPassword(token, "novaSenha1").expect(200);
    await setPassword(token, "outraSenha2").expect(400); // já usado
  });

  it("gerar um link NOVO invalida o anterior", async () => {
    const a = tokenOf((await genReset({ slug: SLUG, email: EMAIL }).expect(201)).body.resetUrl);
    const b = tokenOf((await genReset({ slug: SLUG, email: EMAIL }).expect(201)).body.resetUrl);
    await setPassword(a, "novaSenha1").expect(400); // o antigo caiu
    await setPassword(b, "novaSenha1").expect(200); // o novo vale
  });

  it("link EXPIRADO → 400 (expira em 1h)", async () => {
    const res = await genReset({ slug: SLUG, email: EMAIL }).expect(201);
    // Força a expiração no passado (simula > 1h depois).
    await ctx.dataSource
      .getRepository(UserInvite)
      .update({ email: EMAIL }, { expires_at: new Date(Date.now() - 1000) });
    await setPassword(tokenOf(res.body.resetUrl), "novaSenha1").expect(400);
  });

  it("sem x-platform-key → 401", async () => {
    await genReset({ slug: SLUG, email: EMAIL }, null).expect(401);
  });

  it("slug inexistente → 404", async () => {
    await genReset({ slug: "nao-existe", email: EMAIL }).expect(404);
  });

  it("e-mail inexistente na empresa → 404", async () => {
    await genReset({ slug: SLUG, email: "ninguem@reset.dev" }).expect(404);
  });
});
