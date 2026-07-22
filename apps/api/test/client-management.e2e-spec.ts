import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { Client } from "../src/database/entities/client.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 4.1 — gestão de clientes: listagem paginada, obter por id, edição.
 * Cobre D5 (soft delete some da lista/busca/GET:id), D6 (sem telefone não
 * colide; busca por telefone robusta a null), colisão 409 na edição e
 * isolamento por tenant. Seed determinístico por teste (beforeEach). Requer MySQL.
 */
jest.setTimeout(60000);

describe("Clientes — gestão (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-cm";
  let companyId = "";
  const ids: Record<string, string> = {};
  let otherTenantClientId = "";

  async function login(email: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: SLUG });
    return res.body.accessToken as string;
  }

  async function seedClient(fields: Partial<Client>): Promise<Client> {
    const repo = ctx.dataSource.getRepository(Client);
    return repo.save(repo.create({ company_id: companyId, ...fields }));
  }

  function reload(id: string): Promise<Client | null> {
    return ctx.dataSource.getRepository(Client).findOne({ where: { id } });
  }

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({ name: "Salão CM", slug: SLUG, timezone: "America/Sao_Paulo" }),
    );
    companyId = company.id;
    await ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        company_id: companyId,
        name: "Dono",
        email: "dono@cm.dev",
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );

    // 4 ativas (2 com telefone, 2 sem) + 1 deletada. Ordem por nome: Ana < Bruno < Carla < Diana.
    ids.ana = (await seedClient({ name: "Ana Lima", phone_whatsapp: "11990000001", phone_whatsapp_normalized: "+5511990000001" })).id;
    ids.bruno = (await seedClient({ name: "Bruno Alves" })).id; // sem telefone
    ids.carla = (await seedClient({ name: "Carla Dias" })).id; // sem telefone
    ids.diana = (await seedClient({ name: "Diana Melo", phone_whatsapp: "11990000004", phone_whatsapp_normalized: "+5511990000004" })).id;
    ids.edu = (await seedClient({ name: "Edu Reis", is_deleted: true })).id; // deletada

    const companyB = await companies.save(
      companies.create({ name: "Outro", slug: "outro-cm", timezone: "America/Sao_Paulo" }),
    );
    otherTenantClientId = (
      await ctx.dataSource
        .getRepository(Client)
        .save(ctx.dataSource.getRepository(Client).create({ company_id: companyB.id, name: "Zeca Outro" }))
    ).id;
  });

  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("AC1: lista paginada, ordenada por nome, sem deletados (D5)", async () => {
    const tok = await login("dono@cm.dev");
    const p1 = await request(ctx.app.getHttpServer())
      .get("/api/clients?page=1&pageSize=2")
      .set("Authorization", `Bearer ${tok}`);
    expect(p1.status).toBe(200);
    expect(p1.body.total).toBe(4); // Edu (deletada) fora
    expect(p1.body.page).toBe(1);
    expect(p1.body.pageSize).toBe(2);
    expect(p1.body.clients.map((c: { name: string }) => c.name)).toEqual([
      "Ana Lima",
      "Bruno Alves",
    ]);

    const p2 = await request(ctx.app.getHttpServer())
      .get("/api/clients?page=2&pageSize=2")
      .set("Authorization", `Bearer ${tok}`);
    expect(p2.body.clients.map((c: { name: string }) => c.name)).toEqual([
      "Carla Dias",
      "Diana Melo",
    ]);
    // Deletada não aparece em busca nenhuma.
    const all = p1.body.clients.concat(p2.body.clients);
    expect(all.map((c: { name: string }) => c.name)).not.toContain("Edu Reis");
  });

  it("AC2: busca filtra por nome; e por telefone sem quebrar com registros sem telefone (D6)", async () => {
    const tok = await login("dono@cm.dev");
    const byName = await request(ctx.app.getHttpServer())
      .get("/api/clients?search=Lima&page=1&pageSize=20") // "Lima" só casa Ana Lima (evita "DiAna")
      .set("Authorization", `Bearer ${tok}`);
    expect(byName.body.clients.map((c: { name: string }) => c.name)).toEqual(["Ana Lima"]);

    // Busca por dígitos do telefone: casa quem tem, ignora quem não tem (sem erro).
    const byPhone = await request(ctx.app.getHttpServer())
      .get("/api/clients?search=990000&page=1&pageSize=20")
      .set("Authorization", `Bearer ${tok}`);
    expect(byPhone.status).toBe(200);
    const phoneNames = byPhone.body.clients.map((c: { name: string }) => c.name);
    expect(phoneNames).toEqual(expect.arrayContaining(["Ana Lima", "Diana Melo"]));
    expect(phoneNames).not.toContain("Bruno Alves");
  });

  it("AC5/D5: GET /clients/:id — própria 200; deletada e de outro tenant → 404", async () => {
    const tok = await login("dono@cm.dev");
    await request(ctx.app.getHttpServer())
      .get(`/api/clients/${ids.ana}`)
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    await request(ctx.app.getHttpServer())
      .get(`/api/clients/${ids.edu}`) // deletada
      .set("Authorization", `Bearer ${tok}`)
      .expect(404);
    await request(ctx.app.getHttpServer())
      .get(`/api/clients/${otherTenantClientId}`) // outro tenant
      .set("Authorization", `Bearer ${tok}`)
      .expect(404);
  });

  it("AC4: edita nome e telefone (renormaliza)", async () => {
    const tok = await login("dono@cm.dev");
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/clients/${ids.bruno}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Bruno Alves Jr", phone_whatsapp: "(11) 95555-4444" });
    expect(res.status).toBe(200);
    const saved = await reload(ids.bruno);
    expect(saved?.name).toBe("Bruno Alves Jr");
    expect(saved?.phone_whatsapp_normalized).toBe("+5511955554444");
  });

  it("AC6/D3: editar telefone para o de OUTRA cliente → 409", async () => {
    const tok = await login("dono@cm.dev");
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/clients/${ids.ana}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ phone_whatsapp: "+5511990000004" }); // é da Diana
    expect(res.status).toBe(409);
    expect((await reload(ids.ana))?.phone_whatsapp_normalized).toBe("+5511990000001"); // intacto
  });

  it("D6: dois sem telefone não colidem; remover telefone deixa null sem 409", async () => {
    const tok = await login("dono@cm.dev");
    // Carla (sem telefone) editada mantendo sem telefone → 200 (não colide com Bruno, também sem).
    await request(ctx.app.getHttpServer())
      .patch(`/api/clients/${ids.carla}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Carla Dias Souza", phone_whatsapp: "" })
      .expect(200);
    expect((await reload(ids.carla))?.phone_whatsapp_normalized).toBeNull();

    // Ana (com telefone) removendo o telefone → 200, vira null.
    await request(ctx.app.getHttpServer())
      .patch(`/api/clients/${ids.ana}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ phone_whatsapp: "" })
      .expect(200);
    expect((await reload(ids.ana))?.phone_whatsapp).toBeNull();
  });

  it("editar cliente inexistente/de outro tenant → 404", async () => {
    const tok = await login("dono@cm.dev");
    await request(ctx.app.getHttpServer())
      .patch(`/api/clients/${otherTenantClientId}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ name: "Hack" })
      .expect(404);
  });

  it("autocomplete preservado: GET /clients sem paginação e sem termo → []", async () => {
    const tok = await login("dono@cm.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/clients")
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body.clients).toEqual([]);
  });
});
