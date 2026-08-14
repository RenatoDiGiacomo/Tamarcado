import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { ProfessionalService } from "../src/database/entities/professional-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { AppointmentsService } from "../src/modules/appointments/appointments.service";
import { TenantContextService } from "../src/common/tenant/tenant-context.service";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 3.3 — criação manual + atomicidade. Cobre: source/status/snapshots,
 * `basic`→self, data passada (400), overbooking no manual (aviso, não bloqueia),
 * e o CRÍTICO: duas criações simultâneas no mesmo slot com `enforce=true` →
 * só uma grava (SELECT ... FOR UPDATE). Slot base: 10:00 SP (13:00Z).
 */
jest.setTimeout(60000);

// Data SEMPRE futura (hoje+3), senão a validação "hoje ou futura" derruba com 400
// quando o calendário passa da data — não pode fixar um dia no código. SP é UTC-3
// fixo (sem horário de verão desde 2019), então 10:00 SP = 13:00Z o ano todo.
function isoDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const SLOT_DATE = isoDatePlus(3);
const SLOT_TIME = "10:00";
const SLOT_UTC = `${SLOT_DATE}T13:00:00.000Z`; // 10:00 SP (usado no createAtomic direto)
const PAST_DATE = "2020-01-01";

describe("Agendamento manual — criação (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-cr";
  let companyId = "";
  let ownerId = "";
  let profId = "";
  let serviceId = "";
  let clientId = "";

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

  async function login(email: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: SLUG });
    return res.body.accessToken as string;
  }

  function countAt(when: string): Promise<number> {
    return ctx.dataSource.getRepository(Appointment).count({
      where: {
        company_id: companyId,
        professional_id: profId,
        scheduled_at: new Date(when),
      },
    });
  }

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const companies = ctx.dataSource.getRepository(Company);
    const services = ctx.dataSource.getRepository(SalonService);
    const links = ctx.dataSource.getRepository(ProfessionalService);
    const clients = ctx.dataSource.getRepository(Client);

    const company = await companies.save(
      companies.create({ name: "Salão CR", slug: SLUG, timezone: "America/Sao_Paulo" }),
    );
    companyId = company.id;
    ownerId = (await seedUser(companyId, "dono@cr.dev", "owner", true)).id;
    profId = (await seedUser(companyId, "prof@cr.dev", "manager", true)).id;

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
    await links.save([
      links.create({ company_id: companyId, professional_id: ownerId, service_id: serviceId }),
      links.create({ company_id: companyId, professional_id: profId, service_id: serviceId }),
    ]);
    clientId = (
      await clients.save(clients.create({ company_id: companyId, name: "Maria" }))
    ).id;
  });

  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("AC2: cria manual → source=manual, status=confirmed, snapshots e criador", async () => {
    const tok = await login("dono@cr.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        client_id: clientId,
        service_id: serviceId,
        professional_id: ownerId,
        date: SLOT_DATE,
        time: SLOT_TIME,
      });
    expect(res.status).toBe(201);
    expect(res.body.overbooked).toBe(false);

    const saved = await ctx.dataSource
      .getRepository(Appointment)
      .findOne({ where: { id: res.body.id } });
    expect(saved).toMatchObject({
      source: "manual",
      status: "confirmed",
      duration_minutes: 60,
      price_snapshot: "50.00",
      created_by_user_id: ownerId,
      professional_id: ownerId,
    });
  });

  it("AC1: basic cria só para si (ignora professional_id do body)", async () => {
    const tok = await login("prof@cr.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        client_id: clientId,
        service_id: serviceId,
        professional_id: ownerId, // tenta o dono; deve ser forçado a self
        date: SLOT_DATE,
        time: SLOT_TIME,
      });
    expect(res.status).toBe(201);
    const saved = await ctx.dataSource
      .getRepository(Appointment)
      .findOne({ where: { id: res.body.id } });
    expect(saved?.professional_id).toBe(profId);
  });

  it("D1: profissional sem vínculo ao serviço NÃO bloqueia o manual (cria)", async () => {
    // Atende clientes e ativo, mas sem professional_services p/ o serviço.
    const solo = await seedUser(companyId, "solo@cr.dev", "manager", true);
    const tok = await login("dono@cr.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        client_id: clientId,
        service_id: serviceId,
        professional_id: solo.id,
        date: SLOT_DATE,
        time: SLOT_TIME,
      });
    // Manual é permissivo (D1): o dono escolhe o profissional deliberadamente.
    expect(res.status).toBe(201);
    const saved = await ctx.dataSource
      .getRepository(Appointment)
      .findOne({ where: { id: res.body.id } });
    expect(saved?.professional_id).toBe(solo.id);
  });

  it("AC4: data passada → 400", async () => {
    const tok = await login("dono@cr.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        client_id: clientId,
        service_id: serviceId,
        professional_id: ownerId,
        date: PAST_DATE,
        time: SLOT_TIME,
      });
    expect(res.status).toBe(400);
  });

  it("AC4/D1: slot ocupado NÃO bloqueia no manual — grava com overbooked=true", async () => {
    const tok = await login("dono@cr.dev");
    const body = {
      client_id: clientId,
      service_id: serviceId,
      professional_id: ownerId,
      date: SLOT_DATE,
      time: SLOT_TIME,
    };
    const first = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${tok}`)
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.overbooked).toBe(false);

    const second = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${tok}`)
      .send(body);
    expect(second.status).toBe(201); // não bloqueia
    expect(second.body.overbooked).toBe(true); // mas avisa
  });

  it("CONCORRÊNCIA (NFR-C1): 2 createAtomic simultâneos, mesmo slot, enforce=true → só um grava", async () => {
    const svc = ctx.app.get(AppointmentsService);
    const tenant = ctx.app.get(TenantContextService);
    const when = new Date(SLOT_UTC);
    const call = () =>
      tenant.run(companyId, () =>
        svc.createAtomic({
          clientId,
          serviceId,
          professionalId: profId,
          scheduledAt: when,
          createdByUserId: ownerId,
          enforce: true,
        }),
      );

    const results = await Promise.allSettled([call(), call()]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(ok).toHaveLength(1); // exatamente um venceu
    expect(rejected).toHaveLength(1); // o outro foi barrado (conflito)
    expect(await countAt(SLOT_UTC)).toBe(1); // e só há um agendamento no slot
  });

  it("isolamento: serviço de outro tenant → 400 (não encontrado sob o tenant)", async () => {
    const companyB = await ctx.dataSource
      .getRepository(Company)
      .save(
        ctx.dataSource
          .getRepository(Company)
          .create({ name: "Outro", slug: "outro-cr", timezone: "America/Sao_Paulo" }),
      );
    const svcB = await ctx.dataSource.getRepository(SalonService).save(
      ctx.dataSource.getRepository(SalonService).create({
        company_id: companyB.id,
        name: "B",
        duration_minutes: 30,
        is_active: true,
      }),
    );
    const tok = await login("dono@cr.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/appointments")
      .set("Authorization", `Bearer ${tok}`)
      .send({
        client_id: clientId,
        service_id: svcB.id,
        professional_id: ownerId,
        date: SLOT_DATE,
        time: SLOT_TIME,
      });
    expect(res.status).toBe(400);
  });
});
