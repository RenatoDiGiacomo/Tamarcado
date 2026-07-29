import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * PROVA de isolamento entre tenants (AC3/AC4, NFR-S1/S2/FR-I4).
 * Salão A tem 1 usuário; salão B tem 3 (mais dados). O token de A nunca pode
 * enxergar — nem contar — dados de B; id de B → 404. Empresa inativa → 403.
 */
// bootstrap + resetSchema no beforeAll passam de 5s no Docker local (Windows) —
// alinha ao padrão dos demais e2e (CI Linux é mais rápido).
jest.setTimeout(60000);

describe("Multi-tenant isolation (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  let userBId = "";

  async function seedUser(companyId: string, email: string): Promise<User> {
    return ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        company_id: companyId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
  }

  async function loginToken(email: string, companySlug: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug });
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const a = await companies.save(
      companies.create({ name: "Salão A", slug: "salao-a" }),
    );
    const b = await companies.save(
      companies.create({ name: "Salão B", slug: "salao-b" }),
    );
    const c = await companies.save(
      companies.create({ name: "Salão C", slug: "salao-c", is_active: false }),
    );

    await seedUser(a.id, "dono-a@x.dev");
    const b1 = await seedUser(b.id, "dono-b@x.dev");
    await seedUser(b.id, "func-b1@x.dev");
    await seedUser(b.id, "func-b2@x.dev"); // B tem 3 usuários (mais que A)
    userBId = b1.id;
    await seedUser(c.id, "dono-c@x.dev"); // empresa inativa
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("A lista apenas usuários de A — contagem nunca inclui B (mesmo B tendo mais)", async () => {
    const token = await loginToken("dono-a@x.dev", "salao-a");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1); // só A, apesar de B ter 3
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].email).toBe("dono-a@x.dev");
    const emails = res.body.users.map((u: { email: string }) => u.email);
    expect(emails).not.toContain("dono-b@x.dev");
  });

  it("A acessando id de usuário de B -> 404 (inexistente sob o tenant A)", async () => {
    const token = await loginToken("dono-a@x.dev", "salao-a");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/users/${userBId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("A acessando o próprio /users/me e o próprio id -> 200 (controle positivo)", async () => {
    const token = await loginToken("dono-a@x.dev", "salao-a");
    const me = await request(ctx.app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("dono-a@x.dev");

    const byId = await request(ctx.app.getHttpServer())
      .get(`/api/users/${me.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(byId.status).toBe(200);
  });

  it("token de empresa inativa -> 403 (AC4)", async () => {
    const token = await loginToken("dono-c@x.dev", "salao-c");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("B (simetria) não enxerga usuários de A", async () => {
    const token = await loginToken("dono-b@x.dev", "salao-b");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    const emails = res.body.users.map((u: { email: string }) => u.email);
    expect(emails).not.toContain("dono-a@x.dev");
  });
});
