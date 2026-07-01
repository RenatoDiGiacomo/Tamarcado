import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 1.6 — horários e intervalo (AC2–AC4). PUT owner-only substitui a semana
 * + intervalo (0–120, DL-032); valida attends_clients e faixa (fim > início).
 */
jest.setTimeout(60000);

describe("Horários de atendimento e intervalo (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-sc";
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
      companies.create({ name: "Salão Horários", slug: SLUG }),
    );
    await seedUser(company.id, "dono@sc.dev", "owner", true);
    const prof = await seedUser(company.id, "prof@sc.dev", "basic", true);
    const recep = await seedUser(company.id, "recep@sc.dev", "manager", false);
    attenderId = prof.id;
    nonAttenderId = recep.id;
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("AC2/AC3: Dono configura semana + intervalo e lê de volta", async () => {
    const owner = await login("dono@sc.dev");
    const put = await request(ctx.app.getHttpServer())
      .put(`/api/schedules/${attenderId}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({
        interval_minutes: 15,
        days: [
          { day_of_week: 1, start_time: "08:00", end_time: "18:00", is_active: true },
          { day_of_week: 6, start_time: "09:00", end_time: "14:00", is_active: true },
          { day_of_week: 0, start_time: "00:00", end_time: "00:00", is_active: false },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.intervalMinutes).toBe(15);

    const get = await request(ctx.app.getHttpServer())
      .get(`/api/schedules/${attenderId}`)
      .set("Authorization", `Bearer ${owner}`);
    expect(get.status).toBe(200);
    expect(get.body.intervalMinutes).toBe(15);
    expect(get.body.days).toHaveLength(3);
    const seg = get.body.days.find(
      (d: { dayOfWeek: number }) => d.dayOfWeek === 1,
    );
    expect(seg.startTime).toBe("08:00:00");
    expect(seg.endTime).toBe("18:00:00");
  });

  it("AC2: substituir a semana troca a grade inteira", async () => {
    const owner = await login("dono@sc.dev");
    await request(ctx.app.getHttpServer())
      .put(`/api/schedules/${attenderId}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({
        interval_minutes: 0,
        days: [
          { day_of_week: 2, start_time: "10:00", end_time: "16:00", is_active: true },
        ],
      });
    const get = await request(ctx.app.getHttpServer())
      .get(`/api/schedules/${attenderId}`)
      .set("Authorization", `Bearer ${owner}`);
    expect(get.body.days).toHaveLength(1);
    expect(get.body.days[0].dayOfWeek).toBe(2);
    expect(get.body.intervalMinutes).toBe(0);
  });

  it("AC4: faixa inválida (fim <= início) em dia ativo → 400", async () => {
    const owner = await login("dono@sc.dev");
    const res = await request(ctx.app.getHttpServer())
      .put(`/api/schedules/${attenderId}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({
        interval_minutes: 15,
        days: [
          { day_of_week: 1, start_time: "18:00", end_time: "08:00", is_active: true },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("intervalo acima do teto (>120) → 400", async () => {
    const owner = await login("dono@sc.dev");
    const res = await request(ctx.app.getHttpServer())
      .put(`/api/schedules/${attenderId}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ interval_minutes: 180, days: [] });
    expect(res.status).toBe(400);
  });

  it("profissional que não atende → 400", async () => {
    const owner = await login("dono@sc.dev");
    const res = await request(ctx.app.getHttpServer())
      .put(`/api/schedules/${nonAttenderId}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ interval_minutes: 10, days: [] });
    expect(res.status).toBe(400);
  });

  it("não-Dono configurando horários → 403", async () => {
    const recep = await login("recep@sc.dev");
    const res = await request(ctx.app.getHttpServer())
      .put(`/api/schedules/${attenderId}`)
      .set("Authorization", `Bearer ${recep}`)
      .send({ interval_minutes: 10, days: [] });
    expect(res.status).toBe(403);
  });

  it("profissional fora do tenant → 404", async () => {
    const owner = await login("dono@sc.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/schedules/999999")
      .set("Authorization", `Bearer ${owner}`);
    expect(res.status).toBe(404);
  });
});
