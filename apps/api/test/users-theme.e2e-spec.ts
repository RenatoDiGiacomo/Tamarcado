import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 1.7 — tema individual (AC3). PATCH /users/me grava users.theme do
 * próprio usuário e persiste entre sessões (DL-021/DL-034).
 */
jest.setTimeout(60000);

describe("Tema individual do usuário (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-tema";

  async function login(email: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: SLUG });
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({ name: "Salão Tema", slug: SLUG }),
    );
    const users = ctx.dataSource.getRepository(User);
    await users.save(
      users.create({
        company_id: company.id,
        name: "dono@tema.dev",
        email: "dono@tema.dev",
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: false,
        theme: "light",
        is_active: true,
      }),
    );
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("AC3: tema começa light, muda para dark e persiste", async () => {
    const token = await login("dono@tema.dev");

    const before = await request(ctx.app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);
    expect(before.body.theme).toBe("light");

    const patch = await request(ctx.app.getHttpServer())
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ theme: "dark" });
    expect(patch.status).toBe(200);
    expect(patch.body.theme).toBe("dark");

    // Persiste — novo login/GET reflete dark.
    const token2 = await login("dono@tema.dev");
    const after = await request(ctx.app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token2}`);
    expect(after.body.theme).toBe("dark");
  });

  it("valor de tema inválido → 400", async () => {
    const token = await login("dono@tema.dev");
    const res = await request(ctx.app.getHttpServer())
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ theme: "roxo" });
    expect(res.status).toBe(400);
  });
});
