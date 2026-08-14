import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 4.2 — perfil da cliente: GET /clients/:id enriquecido (notes/createdAt),
 * PATCH de observações, e GET /clients/:id/appointments (histórico DESC, roleScope,
 * 404 fora do tenant, vazio → []). Requer MySQL.
 */
jest.setTimeout(60000);

describe("Perfil da cliente — histórico e observações (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-perfil";
  let companyId = "";
  let profId = "";
  let otherProfId = "";
  let serviceId = "";
  let clientId = "";
  let semHistId = "";
  let otherTenantClientId = "";

  async function seedUser(
    email: string,
    level: AccessLevel,
  ): Promise<User> {
    const repo = ctx.dataSource.getRepository(User);
    return repo.save(
      repo.create({
        company_id: companyId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: level,
        attends_clients: true,
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

  async function seedAppt(fields: Partial<Appointment>): Promise<void> {
    const repo = ctx.dataSource.getRepository(Appointment);
    await repo.save(
      repo.create({
        company_id: companyId,
        client_id: clientId,
        service_id: serviceId,
        duration_minutes: 60,
        source: "manual",
        status: "confirmed",
        ...fields,
      }),
    );
  }

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({ name: "Salão Perfil", slug: SLUG, timezone: "America/Sao_Paulo" }),
    );
    companyId = company.id;
    await seedUser("dono@perfil.dev", "owner");
    profId = (await seedUser("prof@perfil.dev", "manager")).id;
    otherProfId = (await seedUser("outra@perfil.dev", "manager")).id;

    serviceId = (
      await ctx.dataSource.getRepository(SalonService).save(
        ctx.dataSource.getRepository(SalonService).create({
          company_id: companyId,
          name: "Corte",
          duration_minutes: 60,
          price: "50.00",
          is_active: true,
        }),
      )
    ).id;

    const clients = ctx.dataSource.getRepository(Client);
    clientId = (
      await clients.save(clients.create({ company_id: companyId, name: "Cliente Perfil" }))
    ).id;
    semHistId = (
      await clients.save(clients.create({ company_id: companyId, name: "Sem Histórico" }))
    ).id;

    // Histórico: a1 (prof, mais antigo) < a2 (outra) < a3 (não atribuído, mais novo).
    await seedAppt({ professional_id: profId, scheduled_at: new Date("2026-01-10T13:00:00Z"), status: "confirmed" });
    await seedAppt({ professional_id: otherProfId, scheduled_at: new Date("2026-02-15T13:00:00Z"), status: "completed" });
    await seedAppt({ professional_id: null, scheduled_at: new Date("2026-03-20T13:00:00Z"), status: "pending" });

    const companyB = await companies.save(
      companies.create({ name: "Outro", slug: "outro-perfil", timezone: "America/Sao_Paulo" }),
    );
    otherTenantClientId = (
      await clients.save(clients.create({ company_id: companyB.id, name: "De Outro" }))
    ).id;
  });

  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("GET /clients/:id traz notes e createdAt (perfil enriquecido)", async () => {
    const tok = await login("dono@perfil.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("notes"); // null quando sem observações
    expect(typeof res.body.createdAt).toBe("string");
  });

  it("PATCH de observações salva e o GET reflete", async () => {
    const tok = await login("dono@perfil.dev");
    await request(ctx.app.getHttpServer())
      .patch(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${tok}`)
      .send({ notes: "Alérgica a amônia. Prefere manhã." })
      .expect(200);
    const get = await request(ctx.app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(get.body.notes).toBe("Alérgica a amônia. Prefere manhã.");
  });

  it("GET /clients/:id/appointments retorna o histórico mais recente primeiro", async () => {
    const tok = await login("dono@perfil.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/clients/${clientId}/appointments`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    const dates = res.body.appointments.map((a: { date: string }) => a.date);
    expect(dates).toEqual(["2026-03-20", "2026-02-15", "2026-01-10"]); // DESC
    // Item mais recente: não atribuído + serviço/status resolvidos.
    expect(res.body.appointments[0]).toMatchObject({
      serviceName: "Corte",
      professionalName: null,
      status: "pending",
    });
  });

  it("cliente sem agendamentos → { appointments: [] }", async () => {
    const tok = await login("dono@perfil.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/clients/${semHistId}/appointments`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body.appointments).toEqual([]);
  });

  it("basic vê só os próprios + não atribuídos no histórico (roleScope)", async () => {
    const tok = await login("prof@perfil.dev"); // é o profId
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/clients/${clientId}/appointments`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    const dates = res.body.appointments.map((a: { date: string }) => a.date);
    // a3 (não atribuído) + a1 (dele); NÃO a2 (da outra profissional).
    expect(dates).toEqual(["2026-03-20", "2026-01-10"]);
  });

  it("histórico de cliente de outro tenant → 404 (não vaza)", async () => {
    const tok = await login("dono@perfil.dev");
    await request(ctx.app.getHttpServer())
      .get(`/api/clients/${otherTenantClientId}/appointments`)
      .set("Authorization", `Bearer ${tok}`)
      .expect(404);
  });
});
