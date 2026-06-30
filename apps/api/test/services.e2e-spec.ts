import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 1.5 — catálogo de serviços (AC2–AC4). CRUD owner-only (matriz FR-I2),
 * preço opcional (DL-030), `activeOnly` exclui inativos, associação
 * profissional↔serviço restrita a quem atende.
 */
jest.setTimeout(60000);

describe("Catálogo de serviços (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-sv";
  let attenderId = "";
  let nonAttenderId = "";

  async function seedUser(
    companyId: string,
    email: string,
    accessLevel: AccessLevel,
    attends: boolean,
  ): Promise<User> {
    const repo = ctx.dataSource.getRepository(User);
    return repo.save(
      repo.create({
        company_id: companyId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: accessLevel,
        attends_clients: attends,
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
      companies.create({ name: "Salão Serviços", slug: SLUG }),
    );
    await seedUser(company.id, "dono@sv.dev", "owner", true);
    const prof = await seedUser(company.id, "prof@sv.dev", "basic", true);
    const recep = await seedUser(company.id, "recep@sv.dev", "manager", false);
    attenderId = prof.id;
    nonAttenderId = recep.id;
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("AC2: Dono cria serviço com preço e sem preço (opcional, DL-030)", async () => {
    const owner = await login("dono@sv.dev");
    const comPreco = await request(ctx.app.getHttpServer())
      .post("/api/services")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Corte", duration_minutes: 60, price: 50 });
    expect(comPreco.status).toBe(201);
    expect(comPreco.body.price).toBe(50);
    expect(comPreco.body.durationMinutes).toBe(60);

    const semPreco = await request(ctx.app.getHttpServer())
      .post("/api/services")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Coloração", duration_minutes: 120 });
    expect(semPreco.status).toBe(201);
    expect(semPreco.body.price).toBeNull();
  });

  it("AC2: não-Dono não cria serviço → 403", async () => {
    const recep = await login("recep@sv.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/services")
      .set("Authorization", `Bearer ${recep}`)
      .send({ name: "X", duration_minutes: 30 });
    expect(res.status).toBe(403);
  });

  it("AC2/AC3: edita e inativa; activeOnly exclui o inativo", async () => {
    const owner = await login("dono@sv.dev");
    const created = await request(ctx.app.getHttpServer())
      .post("/api/services")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Escova", duration_minutes: 45, price: 40 });
    const id = created.body.id as string;

    const patched = await request(ctx.app.getHttpServer())
      .patch(`/api/services/${id}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ price: 45, is_active: false });
    expect(patched.status).toBe(200);
    expect(patched.body.price).toBe(45);
    expect(patched.body.isActive).toBe(false);

    const all = await request(ctx.app.getHttpServer())
      .get("/api/services")
      .set("Authorization", `Bearer ${owner}`);
    expect(all.body.services.map((s: { id: string }) => s.id)).toContain(id);

    const active = await request(ctx.app.getHttpServer())
      .get("/api/services?activeOnly=true")
      .set("Authorization", `Bearer ${owner}`);
    expect(active.body.services.map((s: { id: string }) => s.id)).not.toContain(
      id,
    );
  });

  it("AC3: gestão/básico conseguem listar serviços (leitura liberada)", async () => {
    const recep = await login("recep@sv.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/services?activeOnly=true")
      .set("Authorization", `Bearer ${recep}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.services)).toBe(true);
  });

  it("AC4: associa profissionais que atendem e lê de volta", async () => {
    const owner = await login("dono@sv.dev");
    const created = await request(ctx.app.getHttpServer())
      .post("/api/services")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Manicure", duration_minutes: 50 });
    const id = created.body.id as string;

    const set = await request(ctx.app.getHttpServer())
      .put(`/api/services/${id}/professionals`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ professionalIds: [attenderId] });
    expect(set.status).toBe(200);
    expect(set.body.professionalIds).toEqual([attenderId]);

    const get = await request(ctx.app.getHttpServer())
      .get(`/api/services/${id}/professionals`)
      .set("Authorization", `Bearer ${owner}`);
    expect(get.body.professionalIds).toEqual([attenderId]);
  });

  it("AC4: rejeita associar quem não atende clientes → 400", async () => {
    const owner = await login("dono@sv.dev");
    const created = await request(ctx.app.getHttpServer())
      .post("/api/services")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Pedicure", duration_minutes: 50 });
    const id = created.body.id as string;

    const res = await request(ctx.app.getHttpServer())
      .put(`/api/services/${id}/professionals`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ professionalIds: [nonAttenderId] });
    expect(res.status).toBe(400);
  });

  it("serviço inexistente sob o tenant → 404", async () => {
    const owner = await login("dono@sv.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/services/999999")
      .set("Authorization", `Bearer ${owner}`);
    expect(res.status).toBe(404);
  });
});
