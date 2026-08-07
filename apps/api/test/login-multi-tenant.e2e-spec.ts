import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Login por E-MAIL, URL única (DL-052 — revoga o slug na rota, DL-050). O tenant
 * é resolvido pelo BACKEND a partir do e-mail. Cobre o que mais importa no
 * sistema — ISOLAMENTO entre tenants — e a desambiguação quando o mesmo e-mail
 * existe em mais de uma empresa (e-mail é único por empresa, DL-026).
 */
jest.setTimeout(60000);

describe("Login por e-mail, URL única (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const api = () => request(ctx.app.getHttpServer());

  async function seedCompanyWithOwner(
    slug: string,
    name: string,
    email: string,
    password = PASSWORD,
  ): Promise<string> {
    const company = await ctx.dataSource.getRepository(Company).save(
      ctx.dataSource
        .getRepository(Company)
        .create({ name, slug, timezone: "America/Sao_Paulo" }),
    );
    await ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        company_id: company.id,
        name: `Dono ${name}`,
        email,
        password_hash: await bcrypt.hash(password, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
    return company.id;
  }
  // Login SEM slug: só e-mail + senha (+ companyId na desambiguação).
  const login = (email: string, password = PASSWORD, companyId?: string) =>
    api()
      .post("/api/auth/login")
      .send({ email, password, ...(companyId ? { companyId } : {}) });

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
  });
  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("dois donos com e-mails DISTINTOS logam SEM slug e cada um só vê os próprios dados (isolamento)", async () => {
    await seedCompanyWithOwner("salao-a", "Salão A", "owner-a@x.dev");
    await seedCompanyWithOwner("salao-b", "Salão B", "owner-b@x.dev");

    const a = await login("owner-a@x.dev").expect(200);
    const b = await login("owner-b@x.dev").expect(200);
    expect(a.body.accessToken).toBeDefined();
    expect(b.body.accessToken).toBeDefined();

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

  it("MESMO e-mail em duas empresas → login pede escolha; com companyId cada um só vê os próprios dados", async () => {
    const idA = await seedCompanyWithOwner("salao-a", "Salão A", "dono@x.dev");
    const idB = await seedCompanyWithOwner("salao-b", "Salão B", "dono@x.dev");

    // Sem companyId: não entra; devolve a lista para escolha (sem tokens).
    const choice = await login("dono@x.dev").expect(200);
    expect(choice.body.accessToken).toBeUndefined();
    const returned = choice.body.companies.map((c: { id: string }) => c.id).sort();
    expect(returned).toEqual([idA, idB].sort());

    // Escolhendo A → entra em A e só vê A; idem B → só vê B (isolamento).
    const a = await login("dono@x.dev", PASSWORD, idA).expect(200);
    const b = await login("dono@x.dev", PASSWORD, idB).expect(200);

    const usersA = await api()
      .get("/api/users")
      .set("Authorization", `Bearer ${a.body.accessToken}`)
      .expect(200);
    const usersB = await api()
      .get("/api/users")
      .set("Authorization", `Bearer ${b.body.accessToken}`)
      .expect(200);
    // Cada token só enxerga o dono da PRÓPRIA empresa: 1 usuário cada, com o
    // MESMO e-mail mas IDs distintos (donos diferentes) — isolamento preservado
    // apesar do e-mail idêntico. (O DTO de /users não expõe company_id.)
    expect(usersA.body.users).toHaveLength(1);
    expect(usersB.body.users).toHaveLength(1);
    expect(usersA.body.users[0].email).toBe("dono@x.dev");
    expect(usersB.body.users[0].email).toBe("dono@x.dev");
    expect(usersA.body.users[0].id).not.toBe(usersB.body.users[0].id);
  });

  it("e-mail inexistente → 401 (sem revelar existência de salão)", async () => {
    await seedCompanyWithOwner("salao-a", "Salão A", "owner-a@x.dev");
    await login("ninguem@x.dev").expect(401);
  });

  it("senha errada → 401", async () => {
    await seedCompanyWithOwner("salao-a", "Salão A", "owner-a@x.dev");
    await login("owner-a@x.dev", "errada").expect(401);
  });

  it("escolha com companyId de empresa onde o e-mail NÃO existe → 401", async () => {
    await seedCompanyWithOwner("salao-a", "Salão A", "owner-a@x.dev");
    const idB = await seedCompanyWithOwner("salao-b", "Salão B", "owner-b@x.dev");
    // e-mail de A, mas escolhendo o tenant B → não existe lá → 401.
    await login("owner-a@x.dev", PASSWORD, idB).expect(401);
  });
});
