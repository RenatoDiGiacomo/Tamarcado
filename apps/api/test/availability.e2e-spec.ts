import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { ProfessionalService } from "../src/database/entities/professional-service.entity";
import { ProfessionalSchedule } from "../src/database/entities/professional-schedule.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { AvailabilityService } from "../src/modules/availability/availability.service";
import { TenantContextService } from "../src/common/tenant/tenant-context.service";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 3.1 — cálculo de disponibilidade (AC3/AC4). Cruza horários + vínculo
 * prof↔serviço + duração + agendamentos; união de profissionais (≥1 livre);
 * professionalId opcional; fuso do tenant; isolamento; hasAvailableSlot (motor
 * da atomicidade da 3.3). Segunda-feira usada: 2026-07-20. Requer MySQL.
 */
jest.setTimeout(60000);

const MONDAY = "2026-07-20";
const SUNDAY = "2026-07-19";

describe("Disponibilidade (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-av";
  let companyId = "";
  let ownerId = "";
  let prof2Id = "";
  let serviceId = "";
  let otherServiceId = ""; // serviço de OUTRO tenant

  async function seedUser(
    cId: string,
    email: string,
    level: AccessLevel,
    attends: boolean,
    interval = 0,
  ): Promise<User> {
    const repo = ctx.dataSource.getRepository(User);
    return repo.save(
      repo.create({
        company_id: cId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: level,
        attends_clients: attends,
        slot_interval_minutes: interval,
        theme: "light",
        is_active: true,
      }),
    );
  }

  async function schedule(
    cId: string,
    profId: string,
    dow: number,
    start: string,
    end: string,
  ): Promise<void> {
    const repo = ctx.dataSource.getRepository(ProfessionalSchedule);
    await repo.save(
      repo.create({
        company_id: cId,
        professional_id: profId,
        day_of_week: dow,
        start_time: start,
        end_time: end,
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
    const services = ctx.dataSource.getRepository(SalonService);
    const links = ctx.dataSource.getRepository(ProfessionalService);
    const clients = ctx.dataSource.getRepository(Client);
    const appts = ctx.dataSource.getRepository(Appointment);

    // Tenant A
    const company = await companies.save(
      companies.create({ name: "Salão AV", slug: SLUG, timezone: "America/Sao_Paulo" }),
    );
    companyId = company.id;
    const owner = await seedUser(companyId, "dono@av.dev", "owner", true);
    const prof2 = await seedUser(companyId, "prof2@av.dev", "basic", true);
    await seedUser(companyId, "recep@av.dev", "manager", false); // não atende
    ownerId = owner.id;
    prof2Id = prof2.id;

    const corte = await services.save(
      services.create({
        company_id: companyId,
        name: "Corte",
        duration_minutes: 60,
        price: "50.00",
        is_active: true,
      }),
    );
    serviceId = corte.id;

    // Ambos executam Corte; ambos trabalham segunda 09:00–12:00.
    await links.save([
      links.create({ company_id: companyId, professional_id: ownerId, service_id: serviceId }),
      links.create({ company_id: companyId, professional_id: prof2Id, service_id: serviceId }),
    ]);
    await schedule(companyId, ownerId, 1, "09:00:00", "12:00:00");
    await schedule(companyId, prof2Id, 1, "09:00:00", "12:00:00");

    // O dono já tem um corte confirmado segunda 10:00 (SP) = 13:00Z.
    const client = await clients.save(
      clients.create({ company_id: companyId, name: "Cliente Teste" }),
    );
    await appts.save(
      appts.create({
        company_id: companyId,
        client_id: client.id,
        service_id: serviceId,
        professional_id: ownerId,
        scheduled_at: new Date("2026-07-20T13:00:00.000Z"),
        duration_minutes: 60,
        price_snapshot: "50.00",
        status: "confirmed",
        source: "manual",
      }),
    );

    // Tenant B (isolamento): serviço próprio.
    const companyB = await companies.save(
      companies.create({ name: "Outro", slug: "outro-av", timezone: "America/Sao_Paulo" }),
    );
    const svcB = await services.save(
      services.create({
        company_id: companyB.id,
        name: "Serviço B",
        duration_minutes: 30,
        is_active: true,
      }),
    );
    otherServiceId = svcB.id;
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("AC3/AC4: união de profissionais — dono ocupado às 10:00, prof2 cobre → 3 slots", async () => {
    const tok = await login("dono@av.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/availability?serviceId=${serviceId}&date=${MONDAY}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    const times = res.body.slots.map((s: { time: string }) => s.time);
    expect(times).toEqual(["09:00", "10:00", "11:00"]);
    // startUtc bate com o fuso (09:00 SP = 12:00Z).
    expect(res.body.slots[0].startUtc).toBe("2026-07-20T12:00:00.000Z");
  });

  it("professionalId=dono: 10:00 sai (ocupado) → 09:00 e 11:00", async () => {
    const tok = await login("dono@av.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/availability?serviceId=${serviceId}&date=${MONDAY}&professionalId=${ownerId}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.body.slots.map((s: { time: string }) => s.time)).toEqual([
      "09:00",
      "11:00",
    ]);
  });

  it("professionalId=prof2: agenda livre → 09:00,10:00,11:00", async () => {
    const tok = await login("dono@av.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/availability?serviceId=${serviceId}&date=${MONDAY}&professionalId=${prof2Id}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.body.slots.map((s: { time: string }) => s.time)).toEqual([
      "09:00",
      "10:00",
      "11:00",
    ]);
  });

  it("domingo (sem horário configurado) → vazio", async () => {
    const tok = await login("dono@av.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/availability?serviceId=${serviceId}&date=${SUNDAY}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.body.slots).toEqual([]);
  });

  it("isolamento: serviço de OUTRO tenant → vazio (não encontrado sob o tenant)", async () => {
    const tok = await login("dono@av.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/availability?serviceId=${otherServiceId}&date=${MONDAY}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
  });

  it("date inválida → 400", async () => {
    const tok = await login("dono@av.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/availability?serviceId=${serviceId}&date=20-07-2026`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(400);
  });

  it("next-dates: examina a semana e retorna só a segunda com vaga", async () => {
    const tok = await login("dono@av.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/availability/next-dates?serviceId=${serviceId}&fromDate=${MONDAY}&days=6`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    const dates = res.body.dates.map((d: { date: string }) => d.date);
    expect(dates).toEqual([MONDAY]); // só segunda tem horário nesta semana
    expect(res.body.dates[0].slots.length).toBe(3);
  });

  it("hasAvailableSlot: motor da atomicidade (3.3) — livre, ocupado e exclude", async () => {
    const svc = ctx.app.get(AvailabilityService);
    const tenant = ctx.app.get(TenantContextService);

    // 09:00 SP (12:00Z): livre para o dono.
    const free = await tenant.run(companyId, () =>
      svc.hasAvailableSlot({
        serviceId,
        scheduledAt: new Date("2026-07-20T12:00:00.000Z"),
        professionalId: ownerId,
      }),
    );
    expect(free).toBe(true);

    // 10:00 SP (13:00Z): o dono está ocupado.
    const taken = await tenant.run(companyId, () =>
      svc.hasAvailableSlot({
        serviceId,
        scheduledAt: new Date("2026-07-20T13:00:00.000Z"),
        professionalId: ownerId,
      }),
    );
    expect(taken).toBe(false);

    // Mas prof2 está livre às 10:00 → union sem professionalId = true.
    const unionFree = await tenant.run(companyId, () =>
      svc.hasAvailableSlot({
        serviceId,
        scheduledAt: new Date("2026-07-20T13:00:00.000Z"),
      }),
    );
    expect(unionFree).toBe(true);
  });
});
