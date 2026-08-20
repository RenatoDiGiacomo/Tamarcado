import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { ProfessionalService } from "../src/database/entities/professional-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 5.9 — Equipe: cadastro de remuneração + PREVISÃO. Cobre: **owner-only**
 * (profissional → 403); comissão **por profissional** (percentual) e **por
 * serviço** (fixo), apurada por atendimento CONCLUÍDO; salário fixo rateado.
 */
jest.setTimeout(60000);

describe("Equipe — remuneração e previsão (e2e, Story 5.9)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-eq";
  const FROM = "2026-09-01";
  const TO = "2026-09-10"; // 10 dias
  let companyId = "";
  let p1 = "";
  let serviceId = "";

  const api = () => request(ctx.app.getHttpServer());
  async function login(email: string): Promise<string> {
    const res = await api()
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: SLUG });
    return res.body.accessToken as string;
  }
  async function seedUser(email: string): Promise<User> {
    const repo = ctx.dataSource.getRepository(User);
    return repo.save(
      repo.create({
        company_id: companyId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "professional",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
  }
  const listTeam = (token: string) =>
    api().get(`/api/team?from=${FROM}&to=${TO}`).set("Authorization", `Bearer ${token}`);
  const patch = (token: string, id: string, body: Record<string, unknown>) =>
    api()
      .patch(`/api/team/${id}/remuneration`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const company = await ctx.dataSource
      .getRepository(Company)
      .save(ctx.dataSource.getRepository(Company).create({ name: "Salão EQ", slug: SLUG }));
    companyId = company.id;

    await seedUser("dono@eq.dev");
    await ctx.dataSource
      .getRepository(User)
      .update({ company_id: companyId, email: "dono@eq.dev" }, { access_level: "owner" });
    const prof = await seedUser("p1@eq.dev");
    p1 = prof.id;

    const service = await ctx.dataSource.getRepository(SalonService).save(
      ctx.dataSource.getRepository(SalonService).create({
        company_id: companyId,
        name: "Corte",
        duration_minutes: 60,
        price: "100.00",
        is_active: true,
      }),
    );
    serviceId = service.id;
    await ctx.dataSource.getRepository(ProfessionalService).save(
      ctx.dataSource
        .getRepository(ProfessionalService)
        .create({ company_id: companyId, professional_id: p1, service_id: serviceId }),
    );
    const client = await ctx.dataSource
      .getRepository(Client)
      .save(ctx.dataSource.getRepository(Client).create({ company_id: companyId, name: "Ana" }));

    // 2 atendimentos CONCLUÍDOS de P1, serviço R$100, dentro do período.
    const apptRepo = ctx.dataSource.getRepository(Appointment);
    await apptRepo.save([1, 2].map(() =>
      apptRepo.create({
        company_id: companyId,
        client_id: client.id,
        service_id: serviceId,
        professional_id: p1,
        scheduled_at: new Date("2026-09-05T14:00:00Z"),
        duration_minutes: 60,
        price_snapshot: "100.00",
        status: "completed",
        source: "manual",
        created_by_user_id: null,
      }),
    ));
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("owner-only: profissional recebe 403 na lista e na edição", async () => {
    const prof = await login("p1@eq.dev");
    await listTeam(prof).expect(403);
    await patch(prof, p1, { commissionScope: "none" }).expect(403);
  });

  it("comissão POR PROFISSIONAL (30%) + salário mensal rateado", async () => {
    const owner = await login("dono@eq.dev");
    await patch(owner, p1, {
      salaryAmount: 3000,
      salaryCadence: "monthly",
      commissionScope: "professional",
      commissionKind: "percent",
      commissionValue: 30,
    }).expect(200);

    const res = await listTeam(owner);
    expect(res.status).toBe(200);
    const members = res.body.members as Array<{
      id: string;
      remuneration: Record<string, unknown>;
      forecast: { commission: number; salary: number; total: number };
    }>;
    const m = members.find((x) => x.id === p1)!;
    expect(m.remuneration).toMatchObject({
      commissionScope: "professional",
      commissionKind: "percent",
      commissionValue: 30,
      salaryCadence: "monthly",
    });
    // comissão: 2 × 100 × 30% = 60; salário: 3000 × 10/30 = 1000; total 1060.
    expect(m.forecast.commission).toBe(60);
    expect(m.forecast.salary).toBe(1000);
    expect(m.forecast.total).toBe(1060);
  });

  it("comissão POR SERVIÇO (fixo R$25/atendimento), sem salário", async () => {
    const owner = await login("dono@eq.dev");
    await patch(owner, p1, {
      salaryAmount: null,
      salaryCadence: null,
      commissionScope: "service",
      serviceCommissions: [{ serviceId, kind: "fixed", value: 25 }],
    }).expect(200);

    const res = await listTeam(owner);
    const members = res.body.members as Array<{
      id: string;
      serviceCommissions: { serviceId: string; serviceName: string; kind: string; value: number }[];
      forecast: { commission: number; salary: number; total: number };
    }>;
    const m = members.find((x) => x.id === p1)!;
    expect(m.serviceCommissions).toEqual(
      expect.arrayContaining([{ serviceId, serviceName: "Corte", kind: "fixed", value: 25 }]),
    );
    // 2 atendimentos × R$25 = 50; sem salário.
    expect(m.forecast.commission).toBe(50);
    expect(m.forecast.salary).toBe(0);
    expect(m.forecast.total).toBe(50);
  });
});
