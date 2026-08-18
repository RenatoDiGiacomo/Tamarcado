import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 5.2 — Financeiro: registro de pagamento no agendamento. Cobre: registrar
 * (upsert) valor/forma/situação; **gate do módulo Financeiro** (sem acesso → 403);
 * **corte de valor** (o campo `payment` NÃO trafega para quem não tem Financeiro);
 * `pendente` NÃO altera o status do agendamento.
 */
jest.setTimeout(60000);

describe("Financeiro — pagamento no agendamento (e2e, Story 5.2)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-pay";
  const DATE = "2026-09-10";
  let companyId = "";
  let apptId = "";

  const api = () => request(ctx.app.getHttpServer());

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
  async function login(email: string): Promise<string> {
    const res = await api()
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: SLUG });
    return res.body.accessToken as string;
  }
  const pay = (token: string, body: Record<string, unknown>): request.Test =>
    api()
      .put(`/api/appointments/${apptId}/payment`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const company = await ctx.dataSource
      .getRepository(Company)
      .save(ctx.dataSource.getRepository(Company).create({ name: "Salão Pay", slug: SLUG }));
    companyId = company.id;

    await seedUser("dono@pay.dev"); // owner? não — precisa ser owner:
    // recria o dono como owner (owner ignora flags → tem Financeiro).
    await ctx.dataSource.getRepository(User).update(
      { company_id: companyId, email: "dono@pay.dev" },
      { access_level: "owner" },
    );
    const profFin = await seedUser("fin@pay.dev"); // professional COM Financeiro
    await ctx.dataSource
      .getRepository(User)
      .update({ id: profFin.id }, { can_view_financeiro: true });
    const profNo = await seedUser("nofin@pay.dev"); // professional SEM Financeiro

    const client = await ctx.dataSource
      .getRepository(Client)
      .save(ctx.dataSource.getRepository(Client).create({ company_id: companyId, name: "Cliente Pay" }));
    const service = await ctx.dataSource.getRepository(SalonService).save(
      ctx.dataSource.getRepository(SalonService).create({
        company_id: companyId,
        name: "Corte",
        duration_minutes: 60,
        price: "50.00",
        is_active: true,
      }),
    );
    const appt = await ctx.dataSource.getRepository(Appointment).save(
      ctx.dataSource.getRepository(Appointment).create({
        company_id: companyId,
        client_id: client.id,
        service_id: service.id,
        professional_id: profNo.id, // é do 'nofin' → ele vê (é dele), mas sem `payment`
        scheduled_at: new Date(`${DATE}T14:00:00Z`), // 11:00 SP
        duration_minutes: 60,
        price_snapshot: "50.00",
        status: "confirmed",
        source: "manual",
        created_by_user_id: null,
      }),
    );
    apptId = appt.id;
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("SEM Financeiro → 403 (não registra pagamento)", async () => {
    const nofin = await login("nofin@pay.dev");
    await pay(nofin, { amount: 50, method: "pix", status: "pago" }).expect(403);
  });

  it("Dono registra pagamento (pago, PIX) → 200 e devolve o pagamento", async () => {
    const owner = await login("dono@pay.dev");
    const res = await pay(owner, { amount: 50, method: "pix", status: "pago" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "pago", amount: 50, method: "pix" });
  });

  it("forma OPCIONAL: registra sem `method` → 200, method null (upsert do mesmo agendamento)", async () => {
    const fin = await login("fin@pay.dev"); // professional COM o flag
    const res = await pay(fin, { amount: 80, status: "pago" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "pago", amount: 80, method: null });
  });

  it("VALOR não trafega: a agenda expõe `payment` só para quem tem Financeiro", async () => {
    const owner = await login("dono@pay.dev");
    const nofin = await login("nofin@pay.dev");
    const q = `?from=${DATE}&to=${DATE}`;

    const asOwner = await api()
      .get(`/api/appointments${q}`)
      .set("Authorization", `Bearer ${owner}`);
    const apptOwner = asOwner.body.appointments.find((a: { id: string }) => a.id === apptId);
    expect(apptOwner.payment).toBeTruthy(); // owner tem Financeiro → vê o pagamento

    const asNoFin = await api()
      .get(`/api/appointments${q}`)
      .set("Authorization", `Bearer ${nofin}`);
    const apptNoFin = asNoFin.body.appointments.find((a: { id: string }) => a.id === apptId);
    // Sem Financeiro: o agendamento vem (é dele), mas SEM o campo payment.
    expect(apptNoFin).toBeTruthy();
    expect("payment" in apptNoFin).toBe(false);
  });

  it("`pendente` NÃO altera o status do agendamento (dado próprio do pagamento)", async () => {
    const owner = await login("dono@pay.dev");
    await pay(owner, { amount: 50, status: "pendente" }).expect(200);
    const saved = await ctx.dataSource
      .getRepository(Appointment)
      .findOne({ where: { id: apptId } });
    expect(saved?.status).toBe("confirmed"); // segue confirmed; pagamento é à parte
  });

  it("RECEBIMENTOS (5.3): lista do período com totais; sem Financeiro → 403", async () => {
    const owner = await login("dono@pay.dev");
    // deixa um pagamento conhecido no agendamento do período (pago, 100).
    await pay(owner, { amount: 100, status: "pago", method: "dinheiro" }).expect(200);

    const res = await api()
      .get(`/api/appointments/payments?from=${DATE}&to=${DATE}`)
      .set("Authorization", `Bearer ${owner}`);
    expect(res.status).toBe(200);
    const item = res.body.receipts.find(
      (r: { appointmentId: string }) => r.appointmentId === apptId,
    );
    expect(item).toMatchObject({
      amount: 100,
      status: "pago",
      method: "dinheiro",
      clientName: "Cliente Pay",
      serviceName: "Corte",
      date: DATE,
    });
    // Um único pagamento (pago) → total recebido 100, pendente 0.
    expect(res.body.totalReceived).toBe(100);
    expect(res.body.totalPending).toBe(0);

    // Sem Financeiro → 403 também na lista de recebimentos.
    const nofin = await login("nofin@pay.dev");
    await api()
      .get(`/api/appointments/payments?from=${DATE}&to=${DATE}`)
      .set("Authorization", `Bearer ${nofin}`)
      .expect(403);
  });
});
