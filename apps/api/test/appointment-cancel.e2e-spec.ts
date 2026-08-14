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
 * Story 3.4 — cancelamento pelo painel. Cobre: transição de estado + rastro de
 * autoria (cancelled_by + cancelled_by_user_id), motivo opcional, permissão
 * (basic só os próprios), guardas de status (completed/no_show/já cancelado),
 * 404, e o CRÍTICO: o slot cancelado volta a ficar livre (não bloqueia). Data
 * sempre futura (hoje+3): a criação exige hoje-ou-futura.
 */
jest.setTimeout(60000);

function isoDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DATE = isoDatePlus(3);
const TIME = "10:00";

describe("Cancelamento de agendamento (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-cancel";
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

  async function createAppt(
    token: string,
    professionalId: string,
    time = TIME,
  ): Promise<{ id: string; overbooked: boolean }> {
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
    return { id: String(res.body.id), overbooked: res.body.overbooked };
  }

  function cancel(token: string, id: string, reason?: string) {
    return request(ctx.app.getHttpServer())
      .patch(`/api/appointments/${id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send(reason === undefined ? {} : { reason });
  }

  function reload(id: string): Promise<Appointment | null> {
    return ctx.dataSource
      .getRepository(Appointment)
      .findOne({ where: { id } });
  }

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({
        name: "Salão Cancel",
        slug: SLUG,
        timezone: "America/Sao_Paulo",
      }),
    );
    companyId = company.id;
    ownerId = (await seedUser("dono@cancel.dev", "owner", true)).id;
    profId = (await seedUser("prof@cancel.dev", "manager", true)).id;
    otherProfId = (await seedUser("outra@cancel.dev", "manager", true)).id;

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
      await ctx.dataSource
        .getRepository(Client)
        .save(
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

  it("cancela um confirmado → status Cancelado + motivo + rastro de autoria (D1)", async () => {
    const owner = await login("dono@cancel.dev");
    const { id } = await createAppt(owner, ownerId);

    const res = await cancel(owner, id, "Cliente pediu para remarcar");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");

    const saved = await reload(id);
    expect(saved?.status).toBe("cancelled");
    expect(saved?.cancellation_reason).toBe("Cliente pediu para remarcar");
    expect(saved?.cancelled_by).toBe("professional"); // lado do salão
    expect(String(saved?.cancelled_by_user_id)).toBe(ownerId); // a pessoa
    expect(saved?.is_deleted).toBe(false); // continua visível
  });

  it("motivo é opcional → cancellation_reason fica null", async () => {
    const owner = await login("dono@cancel.dev");
    const { id } = await createAppt(owner, ownerId);
    const res = await cancel(owner, id); // sem reason
    expect(res.status).toBe(200);
    expect((await reload(id))?.cancellation_reason).toBeNull();
  });

  it("o slot cancelado volta a ficar livre (não bloqueia novo agendamento)", async () => {
    const owner = await login("dono@cancel.dev");
    const a = await createAppt(owner, profId);
    expect(a.overbooked).toBe(false);

    await cancel(owner, a.id).expect(200);

    // Novo agendamento no MESMO slot do profissional → livre (A foi cancelado).
    const b = await createAppt(owner, profId);
    expect(b.overbooked).toBe(false);

    // E a detecção de ocupação segue viva: um terceiro no mesmo slot vê B ocupando.
    const c = await createAppt(owner, profId);
    expect(c.overbooked).toBe(true);
  });

  it("basic NÃO cancela atendimento de outro profissional → 403", async () => {
    const owner = await login("dono@cancel.dev");
    const { id } = await createAppt(owner, otherProfId); // é da "outra"
    const basic = await login("prof@cancel.dev");
    await cancel(basic, id).expect(403);
    expect((await reload(id))?.status).toBe("confirmed"); // intacto
  });

  it("basic cancela o PRÓPRIO atendimento → 200", async () => {
    const basic = await login("prof@cancel.dev");
    const { id } = await createAppt(basic, profId); // basic cria p/ si
    const res = await cancel(basic, id);
    expect(res.status).toBe(200);
    expect(String((await reload(id))?.cancelled_by_user_id)).toBe(profId);
  });

  it("não cancela um atendimento já ENCERRADO (completed) → 400", async () => {
    const owner = await login("dono@cancel.dev");
    const { id } = await createAppt(owner, ownerId);
    await ctx.dataSource
      .getRepository(Appointment)
      .update({ id }, { status: "completed" });
    await cancel(owner, id).expect(400);
  });

  it("cancelar de novo um já cancelado → 409", async () => {
    const owner = await login("dono@cancel.dev");
    const { id } = await createAppt(owner, ownerId);
    await cancel(owner, id).expect(200);
    await cancel(owner, id).expect(409);
  });

  it("id inexistente → 404", async () => {
    const owner = await login("dono@cancel.dev");
    await cancel(owner, "99999999").expect(404);
  });

  it("motivo acima de 500 chars → 400 (validação do DTO)", async () => {
    const owner = await login("dono@cancel.dev");
    const { id } = await createAppt(owner, ownerId);
    await cancel(owner, id, "x".repeat(501)).expect(400);
  });
});
