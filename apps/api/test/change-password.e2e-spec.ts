import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Troca da própria senha (Perfil). Valida a senha atual (400 se não confere),
 * aplica a política do aceite (mín. 8), e o novo login passa a valer.
 */
jest.setTimeout(60000);

describe("Troca de senha (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-senha";
  const api = () => request(ctx.app.getHttpServer());

  // companySlug atende o contrato de login vigente; após o login-por-e-mail
  // (DL-052) o campo é ignorado (whitelist), então serve nos dois casos.
  const login = (password: string) =>
    api()
      .post("/api/auth/login")
      .send({ email: "dono@x.dev", password, companySlug: SLUG });
  const change = (token: string, body: object) =>
    api()
      .patch("/api/users/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

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
        email: "dono@x.dev",
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: false,
        theme: "light",
        is_active: true,
      }),
    );
  });
  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("senha atual correta → troca; login novo passa a valer e o antigo não", async () => {
    const token = (await login(PASSWORD).expect(200)).body.accessToken;
    await change(token, {
      currentPassword: PASSWORD,
      newPassword: "novaSenha1",
    }).expect(200);

    await login("novaSenha1").expect(200); // nova vale
    await login(PASSWORD).expect(401); // antiga não vale mais
  });

  it("senha atual errada → 400 e a senha NÃO muda", async () => {
    const token = (await login(PASSWORD).expect(200)).body.accessToken;
    await change(token, {
      currentPassword: "errada",
      newPassword: "novaSenha1",
    }).expect(400);
    await login(PASSWORD).expect(200); // continua a antiga
  });

  it("nova senha curta (< 8) → 400 (política do aceite)", async () => {
    const token = (await login(PASSWORD).expect(200)).body.accessToken;
    await change(token, { currentPassword: PASSWORD, newPassword: "curta" }).expect(400);
  });

  it("sem token → 401", async () => {
    await api()
      .patch("/api/users/me/password")
      .send({ currentPassword: PASSWORD, newPassword: "novaSenha1" })
      .expect(401);
  });
});
