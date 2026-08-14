import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { AppointmentChange } from "../src/database/entities/appointment-change.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 3.6 — edição unificada (PATCH /appointments/:id). Cobre: troca de serviço
 * (re-snapshot duração/preço), horário, profissional e combinada; registro de
 * alteração (`appointment_changes`, de→para legível); conflito informa overbooked
 * sem bloquear; validações (serviço/profissional/data); estado (completed → 400);
 * permissão D-B1 (basic edita o próprio OU assume um não atribuído, não tira de
 * outro nem atribui a terceiro); 404. Data sempre futura (hoje+3).
 */
jest.setTimeout(60000);

function isoDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DATE = isoDatePlus(3);
const TIME = "10:00";

describe("Edição de agendamento (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-edit";
  let companyId = "";
  let ownerId = "";
  let profId = "";
  let otherProfId = "";
  let corteId = "";
  let coloracaoId = "";
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

  async function createAppt(
    token: string,
    professionalId: string | null,
    time = TIME,
    serviceId = corteId,
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

  function edit(token: string, id: string, body: Record<string, unknown>) {
    return request(ctx.app.getHttpServer())
      .patch(`/api/appointments/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  function reload(id: string): Promise<Appointment | null> {
    return ctx.dataSource.getRepository(Appointment).findOne({ where: { id } });
  }

  function changesOf(id: string): Promise<AppointmentChange[]> {
    return ctx.dataSource
      .getRepository(AppointmentChange)
      .find({ where: { appointment_id: id }, order: { id: "ASC" } });
  }

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({
        name: "Salão Edit",
        slug: SLUG,
        timezone: "America/Sao_Paulo",
      }),
    );
    companyId = company.id;
    ownerId = (await seedUser("dono@edit.dev", "owner", true)).id;
    profId = (await seedUser("prof@edit.dev", "professional", true)).id;
    otherProfId = (await seedUser("outra@edit.dev", "professional", true)).id;

    const services = ctx.dataSource.getRepository(SalonService);
    corteId = (
      await services.save(
        services.create({
          company_id: companyId,
          name: "Corte",
          duration_minutes: 60,
          price: "50.00",
          is_active: true,
        }),
      )
    ).id;
    coloracaoId = (
      await services.save(
        services.create({
          company_id: companyId,
          name: "Coloração",
          duration_minutes: 90,
          price: "180.00",
          is_active: true,
        }),
      )
    ).id;
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

  it("troca o serviço → re-snapshota duração/preço + registra a alteração (de→para)", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId);

    const res = await edit(owner, id, { serviceId: coloracaoId });
    expect(res.status).toBe(200);

    const saved = await reload(id);
    expect(String(saved?.service_id)).toBe(coloracaoId);
    expect(saved?.duration_minutes).toBe(90);
    expect(saved?.price_snapshot).toBe("180.00");

    const chs = await changesOf(id);
    expect(chs).toHaveLength(1);
    expect(chs[0].field).toBe("service");
    expect(chs[0].old_value).toBe("Corte");
    expect(chs[0].new_value).toBe("Coloração");
    expect(String(chs[0].changed_by_user_id)).toBe(ownerId);
  });

  it("troca o horário → scheduled_at muda + registra scheduled_at (de→para)", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId, "10:00");
    const before = (await reload(id))?.scheduled_at?.getTime();

    const res = await edit(owner, id, { time: "11:00" });
    expect(res.status).toBe(200);
    expect((await reload(id))?.scheduled_at?.getTime()).not.toBe(before);

    const chs = await changesOf(id);
    expect(chs).toHaveLength(1);
    expect(chs[0].field).toBe("scheduled_at");
    expect(chs[0].old_value).toContain("10:00");
    expect(chs[0].new_value).toContain("11:00");
  });

  it("troca o profissional → professional_id + assigned_by + registra professional", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId);

    const res = await edit(owner, id, { professionalId: profId });
    expect(res.status).toBe(200);
    const saved = await reload(id);
    expect(String(saved?.professional_id)).toBe(profId);
    expect(String(saved?.assigned_by_user_id)).toBe(ownerId); // coerência com a 3.5

    const chs = await changesOf(id);
    expect(chs).toHaveLength(1);
    expect(chs[0].field).toBe("professional");
    expect(chs[0].old_value).toBe("dono@edit.dev");
    expect(chs[0].new_value).toBe("prof@edit.dev");
  });

  it("edição combinada (serviço + horário + profissional) grava 3 alterações", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId, "10:00");
    const res = await edit(owner, id, {
      serviceId: coloracaoId,
      time: "11:00",
      professionalId: profId,
    });
    expect(res.status).toBe(200);
    const chs = await changesOf(id);
    expect(chs.map((c) => c.field).sort()).toEqual([
      "professional",
      "scheduled_at",
      "service",
    ]);
  });

  it("conflito de horário AVISA (overbooked) mas NÃO bloqueia (D1)", async () => {
    const owner = await login("dono@edit.dev");
    await createAppt(owner, profId, "10:00"); // profId ocupa 10:00
    const id = await createAppt(owner, null, "10:00"); // sem profissional, mesmo horário

    const res = await edit(owner, id, { professionalId: profId });
    expect(res.status).toBe(200);
    expect(res.body.overbooked).toBe(true);
    expect(String((await reload(id))?.professional_id)).toBe(profId); // aplicou
  });

  it("corpo vazio (nada muda) → 200 sem gravar alteração", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId);
    const res = await edit(owner, id, {});
    expect(res.status).toBe(200);
    expect(await changesOf(id)).toHaveLength(0);
  });

  it("serviço inválido → 400", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId);
    await edit(owner, id, { serviceId: "99999999" }).expect(400);
  });

  it("profissional inválido → 400", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId);
    await edit(owner, id, { professionalId: "99999999" }).expect(400);
  });

  it("data no passado → 400", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId);
    await edit(owner, id, { date: isoDatePlus(-2) }).expect(400);
  });

  it("não edita um atendimento ENCERRADO (completed) → 400", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, ownerId);
    await ctx.dataSource
      .getRepository(Appointment)
      .update({ id }, { status: "completed" });
    await edit(owner, id, { time: "11:00" }).expect(400);
  });

  it("basic edita o PRÓPRIO agendamento → 200", async () => {
    const basic = await login("prof@edit.dev");
    const id = await createAppt(basic, profId); // basic cria p/ si
    await edit(basic, id, { time: "11:00" }).expect(200);
  });

  it("basic ASSUME um não atribuído (caso do bot) → 200", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, null);
    const basic = await login("prof@edit.dev");
    const res = await edit(basic, id, { professionalId: profId });
    expect(res.status).toBe(200);
    expect(String((await reload(id))?.professional_id)).toBe(profId);
  });

  it("basic NÃO edita agendamento de outro profissional → 403", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, otherProfId);
    const basic = await login("prof@edit.dev");
    await edit(basic, id, { time: "11:00" }).expect(403);
  });

  it("basic NÃO atribui a um terceiro (só a si) → 403", async () => {
    const owner = await login("dono@edit.dev");
    const id = await createAppt(owner, null);
    const basic = await login("prof@edit.dev");
    await edit(basic, id, { professionalId: otherProfId }).expect(403);
  });

  it("id inexistente → 404", async () => {
    const owner = await login("dono@edit.dev");
    await edit(owner, "99999999", { time: "11:00" }).expect(404);
  });
});
