import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 1.7 — identidade visual da instalação (AC1/AC2/AC4). Config owner-only;
 * logo por URL (DL-034); isolamento via req.user.companyId (companies não é
 * tenant-aware).
 */
jest.setTimeout(60000);

describe("Identidade visual da instalação (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-id";

  async function seedUser(
    companyId: string,
    email: string,
    accessLevel: AccessLevel,
  ): Promise<User> {
    const repo = ctx.dataSource.getRepository(User);
    return repo.save(
      repo.create({
        company_id: companyId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: accessLevel,
        attends_clients: false,
        theme: "light",
        is_active: true,
      }),
    );
  }

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
      companies.create({ name: "Salão ID", slug: SLUG }),
    );
    await seedUser(company.id, "dono@id.dev", "owner");
    await seedUser(company.id, "gestao@id.dev", "manager");
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("AC4: GET /installation retorna a identidade (qualquer autenticado)", async () => {
    const token = await login("gestao@id.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/installation")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Salão ID");
    expect(res.body).toHaveProperty("logoUrl");
    expect(res.body).toHaveProperty("primaryColor");
  });

  it("AC1: Dono edita nome/logo(URL)/cor e o GET reflete", async () => {
    const owner = await login("dono@id.dev");
    const patch = await request(ctx.app.getHttpServer())
      .patch("/api/installation")
      .set("Authorization", `Bearer ${owner}`)
      .send({
        name: "Agenda da Fernanda",
        logoUrl: "https://cdn.exemplo.com/logo.png",
        primaryColor: "#E91E63",
      });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe("Agenda da Fernanda");
    expect(patch.body.logoUrl).toBe("https://cdn.exemplo.com/logo.png");
    expect(patch.body.primaryColor).toBe("#E91E63");

    const get = await request(ctx.app.getHttpServer())
      .get("/api/installation")
      .set("Authorization", `Bearer ${owner}`);
    expect(get.body.name).toBe("Agenda da Fernanda");
    expect(get.body.primaryColor).toBe("#E91E63");
  });

  it("AC1/AC2: não-Dono editando → 403", async () => {
    const gestao = await login("gestao@id.dev");
    const res = await request(ctx.app.getHttpServer())
      .patch("/api/installation")
      .set("Authorization", `Bearer ${gestao}`)
      .send({ name: "Hack" });
    expect(res.status).toBe(403);
  });

  it("cor hex inválida → 400; URL de logo inválida → 400", async () => {
    const owner = await login("dono@id.dev");
    const badColor = await request(ctx.app.getHttpServer())
      .patch("/api/installation")
      .set("Authorization", `Bearer ${owner}`)
      .send({ primaryColor: "roxo" });
    expect(badColor.status).toBe(400);

    const badUrl = await request(ctx.app.getHttpServer())
      .patch("/api/installation")
      .set("Authorization", `Bearer ${owner}`)
      .send({ logoUrl: "não-é-url" });
    expect(badUrl.status).toBe(400);
  });
});
