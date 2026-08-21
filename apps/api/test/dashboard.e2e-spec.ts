import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { Client } from "../src/database/entities/client.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { Payment } from "../src/database/entities/payment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 5.6 — Dashboard (somente leitura). Cobre o **gate do módulo** (sem
 * `can_view_dashboard` → 403) e os **números** consolidados do período:
 * faturamento (pago), a receber (pendente), atendimentos concluídos, total de
 * clientes e média de clientes/semana.
 */
jest.setTimeout(60000);

describe("Dashboard — números do negócio (e2e, Story 5.6)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-dash";
  let companyId = "";

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
  const get = (token: string) =>
    api()
      .get("/api/dashboard?from=2026-09-01&to=2026-09-30")
      .set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const company = await ctx.dataSource
      .getRepository(Company)
      .save(ctx.dataSource.getRepository(Company).create({ name: "Salão Dash", slug: SLUG }));
    companyId = company.id;

    await seedUser("dono@dash.dev");
    await ctx.dataSource
      .getRepository(User)
      .update({ company_id: companyId, email: "dono@dash.dev" }, { access_level: "owner" });
    const profDash = await seedUser("dash@dash.dev"); // COM Dashboard
    await ctx.dataSource
      .getRepository(User)
      .update({ id: profDash.id }, { can_view_dashboard: true });
    await seedUser("nodash@dash.dev"); // SEM Dashboard

    const service = await ctx.dataSource.getRepository(SalonService).save(
      ctx.dataSource.getRepository(SalonService).create({
        company_id: companyId,
        name: "Corte",
        duration_minutes: 60,
        price: "50.00",
        is_active: true,
      }),
    );
    const clientRepo = ctx.dataSource.getRepository(Client);
    const [c1, c2, c3] = await clientRepo.save([
      clientRepo.create({ company_id: companyId, name: "Ana" }),
      clientRepo.create({ company_id: companyId, name: "Bruna" }),
      clientRepo.create({ company_id: companyId, name: "Carla" }),
    ]);

    const apptRepo = ctx.dataSource.getRepository(Appointment);
    const mkAppt = (clientId: string, status: string) =>
      apptRepo.create({
        company_id: companyId,
        client_id: clientId,
        service_id: service.id,
        professional_id: null,
        scheduled_at: new Date("2026-09-10T14:00:00Z"), // 11:00 SP, dentro de setembro
        duration_minutes: 60,
        price_snapshot: "50.00",
        status: status as Appointment["status"],
        source: "manual",
        created_by_user_id: null,
      });
    const [a1, a2, a3] = await apptRepo.save([
      mkAppt(c1.id, "completed"), // pago 50
      mkAppt(c2.id, "completed"), // pago 30
      mkAppt(c3.id, "confirmed"), // pendente 20 (não conta em concluídos)
    ]);
    await apptRepo.save(mkAppt(c1.id, "completed")); // concluído sem pagamento (c1 de novo)

    const payRepo = ctx.dataSource.getRepository(Payment);
    await payRepo.save([
      payRepo.create({ company_id: companyId, appointment_id: a1.id, amount: "50.00", method: "pix", status: "pago", created_by_user_id: null }),
      payRepo.create({ company_id: companyId, appointment_id: a2.id, amount: "30.00", method: null, status: "pago", created_by_user_id: null }),
      payRepo.create({ company_id: companyId, appointment_id: a3.id, amount: "20.00", method: null, status: "pendente", created_by_user_id: null }),
    ]);
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("SEM o módulo Dashboard → 403", async () => {
    const nodash = await login("nodash@dash.dev");
    await get(nodash).expect(403);
  });

  it("Dono vê os números consolidados do período", async () => {
    const owner = await login("dono@dash.dev");
    const res = await get(owner);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      received: 80, // 50 + 30 (pagos) = valor bruto
      pending: 20, // pendente
      expenses: 0, // sem saídas neste cenário
      result: 80, // recebido − saídas
      salesCount: 2, // dois pagamentos `pago`
      averageTicket: 26.67, // 80 ÷ 3 concluídos
      appointmentsCompleted: 3, // a1, a2 e o 4º (c1 sem pagamento)
      totalClients: 3, // Ana, Bruna, Carla
      avgClientsPerWeek: 0.7, // 3 clientes distintas / (30 dias ÷ 7)
    });
    // Pizza: atendimentos por status (3 concluídos + 1 confirmado).
    const status = res.body.statusBreakdown as { status: string; count: number }[];
    expect(status).toEqual(
      expect.arrayContaining([
        { status: "completed", count: 3 },
        { status: "confirmed", count: 1 },
      ]),
    );
    // Barras: top clientes por frequência — Ana (2) à frente de Bruna/Carla (1).
    const top = res.body.topClients as { name: string; count: number }[];
    expect(top[0]).toEqual({ clientId: expect.any(String), name: "Ana", count: 2 });
    expect(top).toHaveLength(3);
    // Linha: faturamento diário (setembro = 30 pontos); o pico está em 10/09.
    const series = res.body.revenueSeries as { label: string; value: number }[];
    expect(series).toHaveLength(30);
    expect(series.find((p) => p.label === "10/09")?.value).toBe(80);
    expect(series.reduce((acc, p) => acc + p.value, 0)).toBe(80);
  });

  it("Profissional COM can_view_dashboard também vê (200)", async () => {
    const dash = await login("dash@dash.dev");
    await get(dash).expect(200);
  });
});
