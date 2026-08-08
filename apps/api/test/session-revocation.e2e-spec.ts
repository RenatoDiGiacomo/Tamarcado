import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Revogação de sessão ao trocar/redefinir senha (Story 1.2.04, DL-025-nota).
 * Versionamento de token: trocar a senha bumpa `token_version`; access E refresh
 * antigos caem na requisição seguinte (não esperam os 15min/7d). Quem trocou
 * recebe tokens novos e segue. Reset por link também derruba as sessões antigas.
 * Desativar usuário continua cortando o acesso (não regrediu).
 */
jest.setTimeout(60000);

const PLATFORM_KEY = "test-platform-key-1234";
process.env.PLATFORM_KEY = PLATFORM_KEY;

describe("Revogação de sessão ao trocar senha (e2e)", () => {
  let ctx: E2EContext;
  const OLD = "senha-antiga";
  const NEW = "senha-nova1";
  const SLUG = "salao-revoga";
  const EMAIL = "dono@revoga.dev";
  const api = () => request(ctx.app.getHttpServer());

  interface Tokens {
    accessToken: string;
    refreshToken: string;
  }
  const login = async (password = OLD): Promise<Tokens> => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: EMAIL, password })
      .expect(200);
    return res.body as Tokens;
  };
  const me = (accessToken: string) =>
    api().get("/api/users/me").set("Authorization", `Bearer ${accessToken}`);
  const refresh = (refreshToken: string) =>
    api().post("/api/auth/refresh").send({ refreshToken });
  const change = (accessToken: string, currentPassword: string, newPassword: string) =>
    api()
      .patch("/api/users/me/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword, newPassword });
  const genReset = () =>
    api()
      .post("/api/platform/password-reset")
      .set("x-platform-key", PLATFORM_KEY)
      .send({ slug: SLUG, email: EMAIL });
  const setPassword = (token: string, password: string) =>
    api().post("/api/auth/accept-invite").send({ token, password });
  const tokenOf = (url: string): string =>
    new URL(url).searchParams.get("token") as string;

  let userId: string;

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const company = await ctx.dataSource
      .getRepository(Company)
      .save(ctx.dataSource.getRepository(Company).create({ name: "S", slug: SLUG }));
    const user = await ctx.dataSource.getRepository(User).save(
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
    userId = user.id;
  });
  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("trocar a senha em uma sessão derruba a OUTRA na requisição seguinte (access e refresh)", async () => {
    const a = await login();
    const b = await login(); // segunda sessão do MESMO usuário
    await me(a.accessToken).expect(200);
    await me(b.accessToken).expect(200);

    await change(a.accessToken, OLD, NEW).expect(200);

    // A sessão B cai já na próxima requisição — não em 15 minutos.
    await me(b.accessToken).expect(401);
    // E o refresh de 7 dias da sessão B também não renova mais.
    await refresh(b.refreshToken).expect(401);
  });

  it("quem trocou a senha continua navegando com os tokens NOVOS, sem relogar", async () => {
    const a = await login();
    const res = await change(a.accessToken, OLD, NEW).expect(200);
    const fresh = res.body as Tokens;
    expect(fresh.accessToken).toBeDefined();
    expect(fresh.refreshToken).toBeDefined();

    // Tokens novos valem…
    await me(fresh.accessToken).expect(200);
    await refresh(fresh.refreshToken).expect(200);
    // …e o access ANTIGO da própria sessão que trocou já não vale (o front troca).
    await me(a.accessToken).expect(401);
  });

  it("reset pelo link temporário também derruba as sessões antigas", async () => {
    const antiga = await login();
    await me(antiga.accessToken).expect(200);

    const link = (await genReset().expect(201)).body.resetUrl as string;
    const nova = (await setPassword(tokenOf(link), NEW).expect(200)).body as Tokens;

    // Sessão anterior ao reset cai; a sessão criada pelo link vale.
    await me(antiga.accessToken).expect(401);
    await me(nova.accessToken).expect(200);
    await login(NEW); // sanity: a nova senha entra
  });

  it("desativar o usuário continua cortando o acesso (não regrediu)", async () => {
    const a = await login();
    await me(a.accessToken).expect(200);

    await ctx.dataSource
      .getRepository(User)
      .update({ id: userId }, { is_active: false });

    await me(a.accessToken).expect(401); // guard barra inativo
    await refresh(a.refreshToken).expect(401); // refresh também
  });
});
