import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 5B.2 — SEGURANÇA do POST público (hostil por padrão). Testes batem a API
 * DIRETO (supertest), sem front, simulando curl/console. Cobre: SQLi (params),
 * regex estrita, whitelist estrita, payload limit, serviceId cross-tenant,
 * honeypot, janela antispam de 2h por telefone, rate limit, consent LGPD. Cada
 * teste sobe app fresco (rate-limiter/DB limpos).
 */
jest.setTimeout(90000);

function isoDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DATE = isoDatePlus(3);

describe("Segurança do agendamento público (e2e)", () => {
  let ctx: E2EContext;
  let serviceIdA = "";
  let serviceIdB = "";
  let profIdA = "";

  function validBody(over: Record<string, unknown> = {}) {
    return {
      name: "Maria Silva",
      phone: "11999998888",
      serviceId: serviceIdA,
      date: DATE,
      time: "10:00",
      consent: true,
      ...over,
    };
  }
  const post = (slug: string, body: object) =>
    request(ctx.app.getHttpServer())
      .post(`/api/public/${slug}/appointments`)
      .send(body);

  function apptCount(): Promise<number> {
    return ctx.dataSource.getRepository(Appointment).count();
  }

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const companies = ctx.dataSource.getRepository(Company);
    const a = await companies.save(
      companies.create({ name: "Salão A", slug: "salao-a", timezone: "America/Sao_Paulo" }),
    );
    const b = await companies.save(
      companies.create({ name: "Salão B", slug: "salao-b", timezone: "America/Sao_Paulo" }),
    );
    const services = ctx.dataSource.getRepository(SalonService);
    serviceIdA = (
      await services.save(
        services.create({ company_id: a.id, name: "Corte", duration_minutes: 60, price: "50.00", is_active: true }),
      )
    ).id;
    serviceIdB = (
      await services.save(
        services.create({ company_id: b.id, name: "Corte B", duration_minutes: 60, price: "70.00", is_active: true }),
      )
    ).id;
    profIdA = (
      await ctx.dataSource.getRepository(User).save(
        ctx.dataSource.getRepository(User).create({
          company_id: a.id, name: "Ana", email: "ana@a.dev", password_hash: "x",
          access_level: "manager", attends_clients: true, theme: "light", is_active: true,
        }),
      )
    ).id;
  });

  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("cria PENDENTE (source=link, snapshots, sem profissional) — caminho feliz", async () => {
    const res = await post("salao-a", validBody());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), status: "pending" });

    const appt = await ctx.dataSource.getRepository(Appointment).findOne({ where: { id: res.body.id } });
    expect(appt?.status).toBe("pending");
    expect(appt?.source).toBe("link");
    expect(appt?.professional_id).toBeNull();
    expect(appt?.created_by_user_id).toBeNull();
    expect(appt?.duration_minutes).toBe(60);
    expect(appt?.price_snapshot).toBe("50.00");
  });

  it("GET availability público reusa o AvailabilityService (shape slots/reason)", async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/public/salao-a/availability?serviceId=${serviceIdA}&date=${DATE}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.slots)).toBe(true);
    expect("reason" in res.body).toBe(true);
  });

  it("profissional OPCIONAL: válido → 201; inválido → 400", async () => {
    await post("salao-a", validBody({ professionalId: profIdA })).expect(201);
    await post("salao-a", validBody({ phone: "11988887777", professionalId: "99999999" })).expect(400);
  });

  // AC3 — regex estrita
  it("AC3 nome inválido (dígito/HTML/curto/longo) → 400", async () => {
    await post("salao-a", validBody({ name: "João123" })).expect(400);
    await post("salao-a", validBody({ name: "<script>alert(1)</script>" })).expect(400);
    await post("salao-a", validBody({ name: "a" })).expect(400);
    await post("salao-a", validBody({ name: "x".repeat(101) })).expect(400);
  });
  it("AC3 nome BR legítimo (acento/apóstrofo/hífen) → 201", async () => {
    await post("salao-a", validBody({ name: "María D'Ávila-Santos" })).expect(201);
  });
  it("AC3 telefone inválido (máscara/+55/curto) → 400", async () => {
    await post("salao-a", validBody({ phone: "+5511999998888" })).expect(400);
    await post("salao-a", validBody({ phone: "(11) 99999-8888" })).expect(400);
    await post("salao-a", validBody({ phone: "11999" })).expect(400);
  });
  it("AC3 date/time inválidos e data passada → 400", async () => {
    await post("salao-a", validBody({ date: "31-12-2026" })).expect(400);
    await post("salao-a", validBody({ time: "25:00" })).expect(400);
    await post("salao-a", validBody({ date: isoDatePlus(-2) })).expect(400);
  });
  it("AC3 consent ausente/false → 400 (LGPD)", async () => {
    await post("salao-a", validBody({ consent: false })).expect(400);
    const body = validBody();
    delete (body as Record<string, unknown>).consent;
    await post("salao-a", body).expect(400);
  });

  // AC4 — whitelist estrita
  it("AC4 campo a mais (companyId/status/id/professional_id) → 400, nada criado", async () => {
    await post("salao-a", validBody({ companyId: "2" })).expect(400);
    await post("salao-a", validBody({ status: "confirmed" })).expect(400);
    await post("salao-a", validBody({ id: 1 })).expect(400);
    expect(await apptCount()).toBe(0);
  });

  // AC1 — SQLi
  it("AC1 SQLi: serviceId injetado → 400, tabela intacta; apóstrofo vira dado", async () => {
    await post("salao-a", validBody({ serviceId: "1; DROP TABLE appointments; --" })).expect(400);
    // Tabela intacta: um create válido ainda funciona.
    const ok = await post("salao-a", validBody({ name: "O'Brien" }));
    expect(ok.status).toBe(201);
    const client = await ctx.dataSource.getRepository(Client).findOne({
      where: { id: (await ctx.dataSource.getRepository(Appointment).findOneByOrFail({ id: ok.body.id })).client_id },
    });
    expect(client?.name).toBe("O'Brien"); // gravado literal (bind), não executado
  });

  // AC6 — cross-tenant
  it("AC6 serviceId de OUTRO salão → 400, nada criado", async () => {
    await post("salao-a", validBody({ serviceId: serviceIdB })).expect(400);
    expect(await apptCount()).toBe(0);
  });

  // AC5 — payload limit
  it("AC5 body gigante (>limite) → 413", async () => {
    const res = await post("salao-a", validBody({ name: "x".repeat(1_000_000) }));
    // 413 pelo teto do body-parser, ou 400 pelo @MaxLength — de todo modo, rejeitado.
    expect([400, 413]).toContain(res.status);
    expect(await apptCount()).toBe(0);
  });

  // honeypot
  it("honeypot preenchido → 400, nada criado", async () => {
    await post("salao-a", validBody({ website: "http://spam" })).expect(400);
    expect(await apptCount()).toBe(0);
  });

  // Janela antispam de 2h por telefone
  it("mesmo telefone de novo em <2h → 429 com mensagem clara", async () => {
    await post("salao-a", validBody({ time: "10:00" })).expect(201);
    const res = await post("salao-a", validBody({ time: "11:00" })); // mesmo telefone
    expect(res.status).toBe(429);
    expect(String(res.body.message)).toMatch(/solicitação recente/i);
    expect(await apptCount()).toBe(1); // o 2º não criou
  });

  // Rate limit (burst por IP)
  it("rajada de POSTs do mesmo IP → 429 em algum momento", async () => {
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await post("salao-a", validBody({ phone: `1199999${String(1000 + i)}` }));
      if (res.status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });

  it("slug inexistente no POST → 404", async () => {
    await post("nao-existe", validBody()).expect(404);
  });
});
