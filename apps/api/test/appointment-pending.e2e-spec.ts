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
 * Story 5B.3 — Pendentes no painel. Cobre: listar/contar pendentes; CONFIRMAR
 * (pending→confirmed, profissional opcional, auditado); RECUSAR (pending→cancelled,
 * motivo obrigatório, auditado); permissão owner/gerente (basic → 403); guardas de
 * estado (não-pending → 409); 404.
 */
jest.setTimeout(60000);

describe("Pendentes no painel (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-pend";
  let companyId = "";
  let ownerId = "";
  let profId = "";
  let clientId = "";
  let serviceId = "";

  async function seedUser(email: string, level: AccessLevel): Promise<User> {
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
  async function seedPending(professionalId: string | null = null): Promise<string> {
    const repo = ctx.dataSource.getRepository(Appointment);
    const saved = await repo.save(
      repo.create({
        company_id: companyId,
        client_id: clientId,
        service_id: serviceId,
        professional_id: professionalId,
        scheduled_at: new Date(Date.now() + 3 * 86400000),
        duration_minutes: 60,
        price_snapshot: "50.00",
        status: "pending",
        source: "manual",
        created_by_user_id: null,
      }),
    );
    return String(saved.id);
  }
  function reload(id: string): Promise<Appointment | null> {
    return ctx.dataSource.getRepository(Appointment).findOne({ where: { id } });
  }
  function changesOf(id: string): Promise<AppointmentChange[]> {
    return ctx.dataSource
      .getRepository(AppointmentChange)
      .find({ where: { appointment_id: id }, order: { id: "ASC" } });
  }
  const api = () => request(ctx.app.getHttpServer());

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({ name: "Salão Pend", slug: SLUG, timezone: "America/Sao_Paulo" }),
    );
    companyId = company.id;
    ownerId = (await seedUser("dono@pend.dev", "owner")).id;
    profId = (await seedUser("prof@pend.dev", "professional")).id;
    serviceId = (
      await ctx.dataSource.getRepository(SalonService).save(
        ctx.dataSource.getRepository(SalonService).create({
          company_id: companyId, name: "Corte", duration_minutes: 60, price: "50.00", is_active: true,
        }),
      )
    ).id;
    clientId = (
      await ctx.dataSource.getRepository(Client).save(
        ctx.dataSource.getRepository(Client).create({ company_id: companyId, name: "Maria" }),
      )
    ).id;
  });
  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("lista e conta os pendentes (owner)", async () => {
    await seedPending();
    await seedPending();
    const owner = await login("dono@pend.dev");
    const list = await api().get("/api/appointments/pending").set("Authorization", `Bearer ${owner}`);
    expect(list.status).toBe(200);
    expect(list.body.appointments).toHaveLength(2);
    expect(list.body.appointments[0].status).toBe("pending");
    const count = await api().get("/api/appointments/pending-count").set("Authorization", `Bearer ${owner}`);
    expect(count.body).toEqual({ count: 2 });
  });

  it("CONFIRMAR sem profissional → confirmed + registra status (audita)", async () => {
    const id = await seedPending();
    const owner = await login("dono@pend.dev");
    const res = await api().patch(`/api/appointments/${id}/confirm`).set("Authorization", `Bearer ${owner}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect((await reload(id))?.status).toBe("confirmed");
    const chs = await changesOf(id);
    expect(chs).toHaveLength(1);
    expect(chs[0].field).toBe("status");
    expect(chs[0].old_value).toBe("Aguardando confirmação");
    expect(chs[0].new_value).toBe("Confirmado");
    expect(String(chs[0].changed_by_user_id)).toBe(ownerId);
  });

  it("CONFIRMAR com profissional → atribui + assigned_by + 2 alterações (status + professional)", async () => {
    const id = await seedPending();
    const owner = await login("dono@pend.dev");
    const res = await api().patch(`/api/appointments/${id}/confirm`).set("Authorization", `Bearer ${owner}`).send({ professionalId: profId });
    expect(res.status).toBe(200);
    const saved = await reload(id);
    expect(saved?.status).toBe("confirmed");
    expect(String(saved?.professional_id)).toBe(profId);
    expect(String(saved?.assigned_by_user_id)).toBe(ownerId);
    expect((await changesOf(id)).map((c) => c.field).sort()).toEqual(["professional", "status"]);
  });

  it("CONFIRMAR com profissional inválido → 400", async () => {
    const id = await seedPending();
    const owner = await login("dono@pend.dev");
    await api().patch(`/api/appointments/${id}/confirm`).set("Authorization", `Bearer ${owner}`).send({ professionalId: "99999999" }).expect(400);
  });

  it("CONFIRMAR um já confirmado → 409", async () => {
    const id = await seedPending();
    await ctx.dataSource.getRepository(Appointment).update({ id }, { status: "confirmed" });
    const owner = await login("dono@pend.dev");
    await api().patch(`/api/appointments/${id}/confirm`).set("Authorization", `Bearer ${owner}`).send({}).expect(409);
  });

  it("RECUSAR com motivo → cancelled + motivo + autoria + registra status", async () => {
    const id = await seedPending();
    const owner = await login("dono@pend.dev");
    const res = await api().patch(`/api/appointments/${id}/reject`).set("Authorization", `Bearer ${owner}`).send({ reason: "Agenda cheia nesse horário" });
    expect(res.status).toBe(200);
    const saved = await reload(id);
    expect(saved?.status).toBe("cancelled");
    expect(saved?.cancellation_reason).toBe("Agenda cheia nesse horário");
    expect(saved?.cancelled_by).toBe("professional");
    expect(String(saved?.cancelled_by_user_id)).toBe(ownerId);
    const chs = await changesOf(id);
    expect(chs[0].new_value).toBe("Cancelado");
  });

  it("RECUSAR sem motivo → 400 (obrigatório)", async () => {
    const id = await seedPending();
    const owner = await login("dono@pend.dev");
    await api().patch(`/api/appointments/${id}/reject`).set("Authorization", `Bearer ${owner}`).send({}).expect(400);
    await api().patch(`/api/appointments/${id}/reject`).set("Authorization", `Bearer ${owner}`).send({ reason: "   " }).expect(400);
  });

  it("RECUSAR um não-pendente → 409", async () => {
    const id = await seedPending();
    await ctx.dataSource.getRepository(Appointment).update({ id }, { status: "confirmed" });
    const owner = await login("dono@pend.dev");
    await api().patch(`/api/appointments/${id}/reject`).set("Authorization", `Bearer ${owner}`).send({ reason: "x" }).expect(409);
  });

  it("ESCOPO (DL-062, refino): Profissional vê SÓ os pendentes DELE; não confirma/recusa (403)", async () => {
    // prof@pend.dev é professional sem `can_manage_all_appointments`.
    const unassigned = await seedPending(null); // não atribuído → NÃO é dele
    await seedPending(profId); // atribuído a ele → é dele
    const prof = await login("prof@pend.dev");

    // list/count agora são ESCOPADOS (200), não 403: vê só o pendente dele (1),
    // o não atribuído fica para quem gerencia a equipe.
    const list = await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${prof}`);
    expect(list.status).toBe(200);
    expect(list.body.appointments).toHaveLength(1);
    expect(String(list.body.appointments[0].professionalId)).toBe(profId);
    const count = await api()
      .get("/api/appointments/pending-count")
      .set("Authorization", `Bearer ${prof}`);
    expect(count.body).toEqual({ count: 1 });

    // Mas CONFIRMAR/RECUSAR seguem exigindo gerência da equipe → 403.
    await api().patch(`/api/appointments/${unassigned}/confirm`).set("Authorization", `Bearer ${prof}`).send({}).expect(403);
    await api().patch(`/api/appointments/${unassigned}/reject`).set("Authorization", `Bearer ${prof}`).send({ reason: "x" }).expect(403);
  });

  it("owner vê TODOS os pendentes (atribuídos e não atribuídos)", async () => {
    await seedPending(null);
    await seedPending(profId);
    const owner = await login("dono@pend.dev");
    const list = await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${owner}`);
    expect(list.body.appointments).toHaveLength(2);
  });

  it("id inexistente → 404", async () => {
    const owner = await login("dono@pend.dev");
    await api().patch("/api/appointments/99999999/confirm").set("Authorization", `Bearer ${owner}`).send({}).expect(404);
    await api().patch("/api/appointments/99999999/reject").set("Authorization", `Bearer ${owner}`).send({ reason: "x" }).expect(404);
  });
});
