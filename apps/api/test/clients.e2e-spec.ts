import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { Client } from "../src/database/entities/client.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 3.3 — clients: busca (autocomplete) + cadastro inline (FR-D7). WhatsApp
 * opcional normalizado; dedup por telefone; isolamento por tenant. Requer MySQL.
 */
jest.setTimeout(60000);

describe("Clientes — busca e cadastro inline (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-cli";
  let companyId = "";

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
    const users = ctx.dataSource.getRepository(User);
    const clients = ctx.dataSource.getRepository(Client);

    const company = await companies.save(
      companies.create({ name: "Salão CLI", slug: SLUG, timezone: "America/Sao_Paulo" }),
    );
    companyId = company.id;
    await users.save(
      users.create({
        company_id: companyId,
        name: "Dono",
        email: "dono@cli.dev",
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
    await clients.save([
      clients.create({ company_id: companyId, name: "Ana Souza" }),
      clients.create({ company_id: companyId, name: "Bianca Reis" }),
    ]);

    // Outro tenant (isolamento).
    const companyB = await companies.save(
      companies.create({ name: "Outro", slug: "outro-cli", timezone: "America/Sao_Paulo" }),
    );
    await clients.save(
      clients.create({ company_id: companyB.id, name: "Ana de Outro Salão" }),
    );
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("busca por nome retorna só os do tenant", async () => {
    const tok = await login("dono@cli.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/clients?search=Ana")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    const names = res.body.clients.map((c: { name: string }) => c.name);
    expect(names).toContain("Ana Souza");
    expect(names).not.toContain("Ana de Outro Salão");
  });

  it("busca vazia → lista vazia (sem termo)", async () => {
    const tok = await login("dono@cli.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/clients")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body.clients).toEqual([]);
  });

  it("cadastro inline com WhatsApp opcional → normaliza e persiste", async () => {
    const tok = await login("dono@cli.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/clients")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Carla Nova", phone_whatsapp: "(11) 98888-7777" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Carla Nova");

    const saved = await ctx.dataSource
      .getRepository(Client)
      .findOne({ where: { id: res.body.id } });
    expect(saved?.phone_whatsapp_normalized).toBe("+5511988887777");
  });

  it("cadastro sem nome → 400", async () => {
    const tok = await login("dono@cli.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/clients")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("mesmo telefone → dedup: retorna o cliente existente", async () => {
    const tok = await login("dono@cli.dev");
    const first = await request(ctx.app.getHttpServer())
      .post("/api/clients")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Duplicada", phone_whatsapp: "11 97777-6666" });
    const second = await request(ctx.app.getHttpServer())
      .post("/api/clients")
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Duplicada 2", phone_whatsapp: "+5511977776666" });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id); // mesmo cliente (dedup por telefone)
  });
});
