import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Fix do bug 1.2.01 (DL-050) — login multi-tenant por slug. Com DUAS empresas,
 * cada dono loga informando o `companySlug` (o front do painel manda o slug da
 * rota /app/{slug}/login) e só enxerga os dados da PRÓPRIA (DL-027). Cobre
 * também as bordas: slug de outra empresa → 401, sem slug com 2+ empresas → 401,
 * slug inexistente → 401 (sem 500, sem enumeração).
 */
jest.setTimeout(60000);

describe("Login multi-tenant por slug (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const api = () => request(ctx.app.getHttpServer());

  async function seedCompanyWithOwner(
    slug: string,
    email: string,
  ): Promise<void> {
    const company = await ctx.dataSource.getRepository(Company).save(
      ctx.dataSource
        .getRepository(Company)
        .create({ name: slug, slug, timezone: "America/Sao_Paulo" }),
    );
    await ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        company_id: company.id,
        name: `Dono ${slug}`,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
  }
  const login = (email: string, companySlug?: string) =>
    api()
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, ...(companySlug ? { companySlug } : {}) });

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    await seedCompanyWithOwner("salao-a", "owner-a@x.dev");
    await seedCompanyWithOwner("salao-b", "owner-b@x.dev");
  });
  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("cada dono loga pelo próprio slug e só vê os dados da própria empresa", async () => {
    const a = await login("owner-a@x.dev", "salao-a").expect(200);
    const b = await login("owner-b@x.dev", "salao-b").expect(200);

    const usersA = await api()
      .get("/api/users")
      .set("Authorization", `Bearer ${a.body.accessToken}`)
      .expect(200);
    const usersB = await api()
      .get("/api/users")
      .set("Authorization", `Bearer ${b.body.accessToken}`)
      .expect(200);

    const emailsA = usersA.body.users.map((u: { email: string }) => u.email);
    const emailsB = usersB.body.users.map((u: { email: string }) => u.email);
    expect(emailsA).toEqual(["owner-a@x.dev"]);
    expect(emailsB).toEqual(["owner-b@x.dev"]);
    expect(emailsA).not.toContain("owner-b@x.dev");
  });

  it("dono A com o slug de B → 401 (não existe naquele tenant)", async () => {
    await login("owner-a@x.dev", "salao-b").expect(401);
  });

  it("sem slug com 2+ empresas → 401 (informe a instalação)", async () => {
    await login("owner-a@x.dev").expect(401);
  });

  it("slug inexistente → 401 (sem 500, sem enumeração)", async () => {
    await login("owner-a@x.dev", "nao-existe").expect(401);
  });
});
