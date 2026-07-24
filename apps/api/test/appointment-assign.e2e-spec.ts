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
 * Story 3.5 — atribuir/trocar profissional pelo painel (DL-043). Cobre: atribuir
 * um não-atribuído (caso do bot) + rastro de autoria (assigned_by_user_id/assigned_at),
 * trocar profissional, desatribuir (null), permissão D5 (basic só a si e só quando
 * nulo), guardas de estado (completed → 400), profissional inválido → 400, conflito
 * informa overbooked mas NÃO bloqueia, e 404. Data sempre futura (hoje+3).
 */
jest.setTimeout(60000);

function isoDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DATE = isoDatePlus(3);
const TIME = "10:00";

describe("Atribuir/trocar profissional (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-assign";
  let companyId = "";
  let ownerId = "";
  let profId = "";
  let otherProfId = "";
  let nonAttenderId = "";
  let serviceId = "";
  let clientId = "";

  async function seedUser(
    email: string,
    level: AccessLevel,
    attends: boolean,
  ): Promise<User> {
    const repo = ctx.dataSource.getRepository(User);
    return repo.save(
      repo.create({
        company_id: companyId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: level,
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

  /** Cria agendamento; `professionalId=null` → não atribuído (caso do bot). */
  async function createAppt(
    token: string,
    professionalId: string | null,
    time = TIME,
  ): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        client_id: clientId,
        service_id: serviceId,
        professional_id: professionalId,
        date: DATE,
        time,
      });
    expect(res.status).toBe(201);
    return String(res.body.id);
  }

  function assign(token: string, id: string, professionalId: string | null) {
    return request(ctx.app.getHttpServer())
      .patch(`/api/appointments/${id}/professional`)
      .set("Authorization", `Bearer ${token}`)
      .send({ professionalId });
  }

  function reload(id: string): Promise<Appointment | null> {
    return ctx.dataSource.getRepository(Appointment).findOne({ where: { id } });
  }

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({
        name: "Salão Assign",
        slug: SLUG,
        timezone: "America/Sao_Paulo",
      }),
    );
    companyId = company.id;
    ownerId = (await seedUser("dono@assign.dev", "owner", true)).id;
    profId = (await seedUser("prof@assign.dev", "basic", true)).id;
    otherProfId = (await seedUser("outra@assign.dev", "basic", true)).id;
    nonAttenderId = (await seedUser("recep@assign.dev", "basic", false)).id;

    const corte = await ctx.dataSource.getRepository(SalonService).save(
      ctx.dataSource.getRepository(SalonService).create({
        company_id: companyId,
        name: "Corte",
        duration_minutes: 60,
        price: "50.00",
        is_active: true,
      }),
    );
    serviceId = corte.id;
    clientId = (
      await ctx.dataSource.getRepository(Client).save(
        ctx.dataSource.getRepository(Client).create({
          company_id: companyId,
          name: "Maria",
        }),
      )
    ).id;
  });

  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("atribui um não-atribuído (caso do bot) → professional_id + rastro de autoria (D2)", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, null);

    const res = await assign(owner, id, profId);
    expect(res.status).toBe(200);
    expect(res.body.appointment.professionalId).toBe(profId);
    expect(res.body.overbooked).toBe(false);

    const saved = await reload(id);
    expect(String(saved?.professional_id)).toBe(profId);
    expect(String(saved?.assigned_by_user_id)).toBe(ownerId);
    expect(saved?.assigned_at).not.toBeNull();
  });

  it("troca o profissional de um agendamento (owner) A → B", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, profId);
    await assign(owner, id, otherProfId).expect(200);
    expect(String((await reload(id))?.professional_id)).toBe(otherProfId);
  });

  it("desatribui (professionalId=null) → volta a não atribuído", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, profId);
    const res = await assign(owner, id, null);
    expect(res.status).toBe(200);
    expect(res.body.appointment.professionalId).toBeNull();
    expect((await reload(id))?.professional_id).toBeNull();
  });

  it("basic atribui A SI MESMO um não-atribuído → 200 (caso do bot)", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, null);
    const basic = await login("prof@assign.dev");
    const res = await assign(basic, id, profId);
    expect(res.status).toBe(200);
    expect(String((await reload(id))?.assigned_by_user_id)).toBe(profId);
  });

  it("basic NÃO tira de outra pessoa (agendamento já atribuído) → 403", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, otherProfId); // já é da "outra"
    const basic = await login("prof@assign.dev");
    await assign(basic, id, profId).expect(403);
    expect(String((await reload(id))?.professional_id)).toBe(otherProfId); // intacto
  });

  it("basic NÃO atribui OUTRO profissional (não a si) num não-atribuído → 403", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, null);
    const basic = await login("prof@assign.dev");
    await assign(basic, id, otherProfId).expect(403);
    expect((await reload(id))?.professional_id).toBeNull(); // intacto
  });

  it("não troca profissional de um atendimento ENCERRADO (completed) → 400", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, profId);
    await ctx.dataSource
      .getRepository(Appointment)
      .update({ id }, { status: "completed" });
    await assign(owner, id, otherProfId).expect(400);
  });

  it("profissional que não atende clientes → 400", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, null);
    await assign(owner, id, nonAttenderId).expect(400);
  });

  it("profissional inexistente → 400", async () => {
    const owner = await login("dono@assign.dev");
    const id = await createAppt(owner, null);
    await assign(owner, id, "99999999").expect(400);
  });

  it("conflito de horário AVISA (overbooked) mas NÃO bloqueia (D3/D1)", async () => {
    const owner = await login("dono@assign.dev");
    // profId já ocupa TIME; o novo agendamento (sem profissional) no mesmo TIME
    // é atribuído a profId → sobrepõe, mas segue (200 + overbooked=true).
    await createAppt(owner, profId, TIME);
    const id = await createAppt(owner, null, TIME);

    const res = await assign(owner, id, profId);
    expect(res.status).toBe(200);
    expect(res.body.overbooked).toBe(true);
    expect(String((await reload(id))?.professional_id)).toBe(profId); // aplicou mesmo assim
  });

  it("id inexistente → 404", async () => {
    const owner = await login("dono@assign.dev");
    await assign(owner, "99999999", profId).expect(404);
  });
});
