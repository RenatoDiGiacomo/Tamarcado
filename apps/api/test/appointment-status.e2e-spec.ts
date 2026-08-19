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
 * Story 3.7 — marcar comparecimento (PATCH /appointments/:id/status). Cobre o mapa
 * de transição: confirmed+passou → no_show; confirmed+começou → completed; ambos
 * registram em appointment_changes (field="status", de→para); FUTURO → 400; origem
 * terminal (completed/cancelled) → 409; permissão D3 (basic só o próprio); 404.
 * Agendamentos são criados no passado/futuro escrevendo scheduled_at direto (a
 * criação pela API exige hoje-ou-futura).
 */
jest.setTimeout(60000);

describe("Marcar comparecimento (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-status";
  let companyId = "";
  let ownerId = "";
  let profId = "";
  let otherProfId = "";
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

  /** Cria um agendamento diretamente (bypassa a regra hoje-ou-futura da API). */
  async function seedAppt(opts: {
    professionalId: string | null;
    offsetMs: number; // relativo a agora (negativo = passado)
    status?: Appointment["status"];
  }): Promise<string> {
    const repo = ctx.dataSource.getRepository(Appointment);
    const saved = await repo.save(
      repo.create({
        company_id: companyId,
        client_id: clientId,
        service_id: serviceId,
        professional_id: opts.professionalId,
        scheduled_at: new Date(Date.now() + opts.offsetMs),
        duration_minutes: 60,
        price_snapshot: "50.00",
        status: opts.status ?? "confirmed",
        source: "manual",
        created_by_user_id: ownerId,
      }),
    );
    return String(saved.id);
  }

  function setStatus(token: string, id: string, to: string) {
    return request(ctx.app.getHttpServer())
      .patch(`/api/appointments/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ to });
  }

  function reload(id: string): Promise<Appointment | null> {
    return ctx.dataSource.getRepository(Appointment).findOne({ where: { id } });
  }

  function changesOf(id: string): Promise<AppointmentChange[]> {
    return ctx.dataSource
      .getRepository(AppointmentChange)
      .find({ where: { appointment_id: id }, order: { id: "ASC" } });
  }

  const HOUR = 3600000;

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({
        name: "Salão Status",
        slug: SLUG,
        timezone: "America/Sao_Paulo",
      }),
    );
    companyId = company.id;
    ownerId = (await seedUser("dono@status.dev", "owner", true)).id;
    profId = (await seedUser("prof@status.dev", "professional", true)).id;
    otherProfId = (await seedUser("outra@status.dev", "professional", true)).id;

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

  it("confirmed + passou → no_show + registra a alteração (Confirmado → Não compareceu)", async () => {
    const owner = await login("dono@status.dev");
    const id = await seedAppt({ professionalId: ownerId, offsetMs: -1 * HOUR });

    const res = await setStatus(owner, id, "no_show");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("no_show");

    expect((await reload(id))?.status).toBe("no_show");
    const chs = await changesOf(id);
    expect(chs).toHaveLength(1);
    expect(chs[0].field).toBe("status");
    expect(chs[0].old_value).toBe("Confirmado");
    expect(chs[0].new_value).toBe("Não compareceu");
    expect(String(chs[0].changed_by_user_id)).toBe(ownerId);
  });

  it("confirmed + começou → completed + registra (Confirmado → Concluído)", async () => {
    const owner = await login("dono@status.dev");
    const id = await seedAppt({ professionalId: ownerId, offsetMs: -30 * 60000 });

    const res = await setStatus(owner, id, "completed");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    const chs = await changesOf(id);
    expect(chs[0].new_value).toBe("Concluído");
  });

  it("agendamento FUTURO → no_show = 400 (não começou)", async () => {
    const owner = await login("dono@status.dev");
    const id = await seedAppt({ professionalId: ownerId, offsetMs: 2 * HOUR });
    await setStatus(owner, id, "no_show").expect(400);
    expect((await reload(id))?.status).toBe("confirmed"); // intacto
  });

  it("agendamento FUTURO → completed = 400 (não começou)", async () => {
    const owner = await login("dono@status.dev");
    const id = await seedAppt({ professionalId: ownerId, offsetMs: 2 * HOUR });
    await setStatus(owner, id, "completed").expect(400);
  });

  it("origem terminal (completed) → 409", async () => {
    const owner = await login("dono@status.dev");
    const id = await seedAppt({
      professionalId: ownerId,
      offsetMs: -1 * HOUR,
      status: "completed",
    });
    await setStatus(owner, id, "no_show").expect(409);
  });

  it("origem cancelada → 409", async () => {
    const owner = await login("dono@status.dev");
    const id = await seedAppt({
      professionalId: ownerId,
      offsetMs: -1 * HOUR,
      status: "cancelled",
    });
    await setStatus(owner, id, "completed").expect(409);
  });

  it("basic marca o PRÓPRIO atendimento passado → 200", async () => {
    const basic = await login("prof@status.dev");
    const id = await seedAppt({ professionalId: profId, offsetMs: -1 * HOUR });
    const res = await setStatus(basic, id, "completed");
    expect(res.status).toBe(200);
    expect(String((await changesOf(id))[0].changed_by_user_id)).toBe(profId);
  });

  it("basic NÃO marca atendimento de outro profissional → 403", async () => {
    const id = await seedAppt({ professionalId: otherProfId, offsetMs: -1 * HOUR });
    const basic = await login("prof@status.dev");
    await setStatus(basic, id, "no_show").expect(403);
    expect((await reload(id))?.status).toBe("confirmed");
  });

  it("valor de status inválido (ex.: confirmed) → 400 (DTO)", async () => {
    const owner = await login("dono@status.dev");
    const id = await seedAppt({ professionalId: ownerId, offsetMs: -1 * HOUR });
    await setStatus(owner, id, "confirmed").expect(400);
  });

  it("id inexistente → 404", async () => {
    const owner = await login("dono@status.dev");
    await setStatus(owner, "99999999", "completed").expect(404);
  });
});
