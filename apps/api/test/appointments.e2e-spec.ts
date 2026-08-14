import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import type {
  AppointmentSource,
  AppointmentStatus,
} from "../src/database/entities/appointment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 3.2 — listagem da agenda (AC2/AC3/AC7). Período em datas civis (fuso do
 * tenant) → range UTC; nomes resolvidos; filtro por papel (owner vê todos, basic
 * só os próprios + não atribuídos); isolamento por tenant; horário comercial na
 * resposta. Segunda usada: 2026-07-20. Requer MySQL.
 */
jest.setTimeout(60000);

const MON = "2026-07-20";
const TUE = "2026-07-21";

interface Item {
  id: string;
  clientName: string;
  serviceName: string;
  professionalName: string | null;
  date: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  source: AppointmentSource;
}

describe("Agenda — listagem (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-ag";
  let companyId = "";
  let ownerId = "";
  let profId = "";
  let serviceId = "";
  let clientId = "";
  let apptOwnerId = "";
  let apptProfId = "";
  let apptNullId = "";

  async function seedUser(
    cId: string,
    email: string,
    level: AccessLevel,
    attends: boolean,
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
        theme: "light",
        is_active: true,
      }),
    );
  }

  async function appt(over: Partial<Appointment>): Promise<Appointment> {
    const repo = ctx.dataSource.getRepository(Appointment);
    return repo.save(
      repo.create({
        company_id: companyId,
        client_id: clientId,
        service_id: serviceId,
        professional_id: null,
        scheduled_at: new Date("2026-07-20T12:00:00.000Z"),
        duration_minutes: 60,
        price_snapshot: "50.00",
        status: "confirmed",
        source: "manual",
        ...over,
      }),
    );
  }

  async function login(email: string, slug = SLUG): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: slug });
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const services = ctx.dataSource.getRepository(SalonService);
    const clients = ctx.dataSource.getRepository(Client);

    const company = await companies.save(
      companies.create({
        name: "Salão AG",
        slug: SLUG,
        timezone: "America/Sao_Paulo",
        business_hours_start: "08:00:00",
        business_hours_end: "19:00:00",
      }),
    );
    companyId = company.id;
    const owner = await seedUser(companyId, "dono@ag.dev", "owner", true);
    const prof = await seedUser(companyId, "prof@ag.dev", "manager", true);
    ownerId = owner.id;
    profId = prof.id;

    const svc = await services.save(
      services.create({
        company_id: companyId,
        name: "Corte",
        duration_minutes: 60,
        price: "50.00",
        is_active: true,
      }),
    );
    serviceId = svc.id;
    const client = await clients.save(
      clients.create({ company_id: companyId, name: "Maria" }),
    );
    clientId = client.id;

    // Segunda: 3 agendamentos — do dono (09:00), do prof (10:00), não atribuído (11:00).
    apptOwnerId = (
      await appt({
        professional_id: ownerId,
        scheduled_at: new Date("2026-07-20T12:00:00.000Z"),
        source: "whatsapp",
      })
    ).id;
    apptProfId = (
      await appt({
        professional_id: profId,
        scheduled_at: new Date("2026-07-20T13:00:00.000Z"),
      })
    ).id;
    apptNullId = (
      await appt({
        professional_id: null,
        scheduled_at: new Date("2026-07-20T14:00:00.000Z"),
      })
    ).id;

    // Terça: um do prof (fora do período segunda). E um deletado (não aparece).
    await appt({
      professional_id: profId,
      scheduled_at: new Date("2026-07-21T13:00:00.000Z"),
    });
    await appt({
      professional_id: ownerId,
      scheduled_at: new Date("2026-07-20T15:00:00.000Z"),
      is_deleted: true,
    });

    // Outro tenant (isolamento).
    const companyB = await companies.save(
      companies.create({ name: "Outro", slug: "outro-ag", timezone: "America/Sao_Paulo" }),
    );
    const svcB = await services.save(
      services.create({
        company_id: companyB.id,
        name: "Serviço B",
        duration_minutes: 30,
        is_active: true,
      }),
    );
    const clientB = await clients.save(
      clients.create({ company_id: companyB.id, name: "Cliente B" }),
    );
    const ownerB = await seedUser(companyB.id, "dono@b.dev", "owner", true);
    await ctx.dataSource.getRepository(Appointment).save(
      ctx.dataSource.getRepository(Appointment).create({
        company_id: companyB.id,
        client_id: clientB.id,
        service_id: svcB.id,
        professional_id: ownerB.id,
        scheduled_at: new Date("2026-07-20T13:00:00.000Z"),
        duration_minutes: 30,
        status: "confirmed",
        source: "manual",
      }),
    );
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("AC2: owner vê os 3 da segunda com nomes/horário resolvidos e horário comercial", async () => {
    const tok = await login("dono@ag.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/appointments?from=${MON}&to=${MON}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(200);
    const items: Item[] = res.body.appointments;
    expect(items).toHaveLength(3);
    // Ordenados por horário.
    expect(items.map((i) => i.start)).toEqual(["09:00", "10:00", "11:00"]);
    expect(items[0]).toMatchObject({
      clientName: "Maria",
      serviceName: "Corte",
      professionalName: "dono@ag.dev",
      date: "2026-07-20",
      start: "09:00",
      end: "10:00",
      status: "confirmed",
      source: "whatsapp",
    });
    expect(res.body.businessHours).toEqual({ start: "08:00", end: "19:00" });
  });

  it("AC4: agendamento sem profissional vem com professionalName null", async () => {
    const tok = await login("dono@ag.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/appointments?from=${MON}&to=${MON}`)
      .set("Authorization", `Bearer ${tok}`);
    const nullItem = res.body.appointments.find((i: Item) => i.id === apptNullId);
    expect(nullItem.professionalName).toBeNull();
  });

  it("AC3: basic vê só os próprios + os não atribuídos (não os do dono)", async () => {
    const tok = await login("prof@ag.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/appointments?from=${MON}&to=${MON}`)
      .set("Authorization", `Bearer ${tok}`);
    const ids: string[] = res.body.appointments.map((i: Item) => i.id);
    expect(ids).toContain(apptProfId);
    expect(ids).toContain(apptNullId);
    expect(ids).not.toContain(apptOwnerId);
  });

  it("AC7: período de segunda a terça inclui os dois dias", async () => {
    const tok = await login("dono@ag.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/appointments?from=${MON}&to=${TUE}`)
      .set("Authorization", `Bearer ${tok}`);
    const dates: string[] = res.body.appointments.map((i: Item) => i.date);
    expect(dates).toContain("2026-07-20");
    expect(dates).toContain("2026-07-21");
  });

  it("não retorna agendamentos deletados", async () => {
    const tok = await login("dono@ag.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/appointments?from=${MON}&to=${MON}`)
      .set("Authorization", `Bearer ${tok}`);
    // 3 vivos na segunda; o deletado (15:00Z) não entra.
    expect(res.body.appointments).toHaveLength(3);
  });

  it("isolamento: agendamento de outro tenant nunca aparece", async () => {
    const tok = await login("dono@ag.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/appointments?from=${MON}&to=${MON}`)
      .set("Authorization", `Bearer ${tok}`);
    const names: string[] = res.body.appointments.map((i: Item) => i.clientName);
    expect(names).not.toContain("Cliente B");
  });

  it("from inválido → 400", async () => {
    const tok = await login("dono@ag.dev");
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/appointments?from=20-07-2026&to=${MON}`)
      .set("Authorization", `Bearer ${tok}`);
    expect(res.status).toBe(400);
  });

  it("sem token → 401", async () => {
    const res = await request(ctx.app.getHttpServer()).get(
      `/api/appointments?from=${MON}&to=${MON}`,
    );
    expect(res.status).toBe(401);
  });
});
