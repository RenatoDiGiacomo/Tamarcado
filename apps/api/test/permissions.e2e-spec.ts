import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { Client } from "../src/database/entities/client.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { ProfessionalService } from "../src/database/entities/professional-service.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 5.1 — Fundação de permissões (DL-062).
 * Prova, ponta a ponta:
 *  - REVOGAÇÃO IMEDIATA: o Dono desliga um flag e, na PRÓXIMA requisição do
 *    usuário (MESMO token, sem relogar), o dado JÁ some — porque a autorização
 *    lê a linha FRESCA do banco a cada request (ActiveUserGuard → @Actor), não o
 *    token. É a comprovação que substitui o screenshot da revogação.
 *  - `/users/me` expõe os flags (o front monta menu/escopo a partir daí).
 *  - só o Dono concede; o Dono não remove o próprio acesso (owner ignora flags).
 */
jest.setTimeout(60000);

describe("Fundação de permissões (e2e, DL-062)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-perm";
  let companyId = "";
  let ownerId = "";
  let managerId = "";

  async function seedUser(
    email: string,
    accessLevel: AccessLevel,
    attends = false,
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

  const api = () => request(ctx.app.getHttpServer());

  async function login(email: string): Promise<string> {
    const res = await api()
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: SLUG });
    return res.body.accessToken as string;
  }

  /** Dono altera flags de um usuário (PATCH /users/:id, @Roles('owner')). */
  function setFlags(
    ownerToken: string,
    userId: string,
    body: Record<string, unknown>,
  ): request.Test {
    return api()
      .patch(`/api/users/${userId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(body);
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({ name: "Salão Perm", slug: SLUG }),
    );
    companyId = company.id;
    ownerId = (await seedUser("dono@perm.dev", "owner", true)).id;
    managerId = (await seedUser("gestao@perm.dev", "professional", true)).id;

    // Um pendente NÃO ATRIBUÍDO: só quem gerencia a equipe o enxerga. É o alvo
    // do teste de revogação imediata (aparece com o flag, some sem ele).
    const client = await ctx.dataSource.getRepository(Client).save(
      ctx.dataSource.getRepository(Client).create({
        company_id: companyId,
        name: "Cliente Perm",
      }),
    );
    const service = await ctx.dataSource.getRepository(SalonService).save(
      ctx.dataSource.getRepository(SalonService).create({
        company_id: companyId,
        name: "Corte",
        duration_minutes: 60,
        price: "50.00",
        is_active: true,
      }),
    );
    // Rule 5: o Profissional executa "Corte" (vínculo), mas NÃO "Coloração".
    await ctx.dataSource.getRepository(SalonService).save(
      ctx.dataSource.getRepository(SalonService).create({
        company_id: companyId,
        name: "Coloração",
        duration_minutes: 90,
        price: "120.00",
        is_active: true,
      }),
    );
    await ctx.dataSource.getRepository(ProfessionalService).save(
      ctx.dataSource.getRepository(ProfessionalService).create({
        company_id: companyId,
        professional_id: managerId,
        service_id: service.id,
      }),
    );
    await ctx.dataSource.getRepository(Appointment).save(
      ctx.dataSource.getRepository(Appointment).create({
        company_id: companyId,
        client_id: client.id,
        service_id: service.id,
        professional_id: null,
        scheduled_at: new Date(Date.now() + 3 * 86400000),
        duration_minutes: 60,
        price_snapshot: "50.00",
        status: "pending",
        source: "manual",
        created_by_user_id: null,
      }),
    );
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  // Isola cada teste: todos os flags voltam a OFF antes de cada caso.
  beforeEach(async () => {
    await ctx.dataSource.getRepository(User).update(
      { company_id: companyId },
      {
        can_view_financeiro: false,
        can_view_dashboard: false,
        can_manage_all_appointments: false,
      },
    );
  });

  it("REVOGAÇÃO IMEDIATA: Dono liga o escopo → o pendente NÃO ATRIBUÍDO aparece; desliga → some na PRÓXIMA requisição (mesmo token)", async () => {
    const ownerToken = await login("dono@perm.dev");
    const profToken = await login("gestao@perm.dev"); // capturado UMA vez

    // Sem o flag, o Profissional vê SÓ os seus pendentes → o não atribuído some.
    const before = await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${profToken}`);
    expect(before.status).toBe(200);
    expect(before.body.appointments).toHaveLength(0);

    // Dono LIGA can_manage_all_appointments.
    await setFlags(ownerToken, managerId, {
      can_manage_all_appointments: true,
    }).expect(200);

    // MESMO token → agora enxerga o pendente não atribuído (sem relogar).
    const granted = await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${profToken}`);
    expect(granted.body.appointments).toHaveLength(1);

    // Dono REVOGA.
    await setFlags(ownerToken, managerId, {
      can_manage_all_appointments: false,
    }).expect(200);

    // MESMO token → o pendente JÁ sumiu na próxima requisição. Revogação imediata
    // (a autorização lê a linha fresca do banco a cada request, não o token).
    const revoked = await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${profToken}`);
    expect(revoked.body.appointments).toHaveLength(0);
  });

  it("SERVIÇOS (rule 5): Profissional só enxerga os serviços que executa; owner vê todos", async () => {
    const profToken = await login("gestao@perm.dev");
    const profList = await api()
      .get("/api/services")
      .set("Authorization", `Bearer ${profToken}`);
    const profNames = (profList.body.services as { name: string }[]).map(
      (s) => s.name,
    );
    expect(profNames).toContain("Corte"); // executa
    expect(profNames).not.toContain("Coloração"); // NÃO executa (só o Dono faria)

    const ownerToken = await login("dono@perm.dev");
    const ownerList = await api()
      .get("/api/services")
      .set("Authorization", `Bearer ${ownerToken}`);
    const ownerNames = (ownerList.body.services as { name: string }[]).map(
      (s) => s.name,
    );
    expect(ownerNames).toEqual(expect.arrayContaining(["Corte", "Coloração"]));
  });

  it("CLIENTES (rule 2): lista paginada do módulo recorta ao que o Profissional atendeu; busca do agendamento NÃO recorta", async () => {
    const profToken = await login("gestao@perm.dev");
    // O Profissional não atendeu ninguém (o pendente seedado é NÃO atribuído) →
    // a LISTA do módulo (?page) vem vazia.
    const list = await api()
      .get("/api/clients?page=1&pageSize=20")
      .set("Authorization", `Bearer ${profToken}`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(0);
    // Mas a BUSCA do agendamento (sem ?page) NÃO recorta — acha a cliente.
    const search = await api()
      .get("/api/clients?search=Cliente")
      .set("Authorization", `Bearer ${profToken}`);
    expect(search.body.clients.length).toBeGreaterThanOrEqual(1);
  });

  it("/users/me expõe os flags (o front monta menu e escopo a partir daqui)", async () => {
    const ownerToken = await login("dono@perm.dev");
    await setFlags(ownerToken, managerId, {
      can_view_financeiro: true,
      can_view_dashboard: false,
    }).expect(200);

    const managerToken = await login("gestao@perm.dev");
    const me = await api()
      .get("/api/users/me")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      canViewFinanceiro: true,
      canViewDashboard: false,
      canManageAllAppointments: false,
    });
  });

  it("só o Dono concede: Gestão tentando alterar flags de alguém → 403", async () => {
    const managerToken = await login("gestao@perm.dev");
    await api()
      .patch(`/api/users/${ownerId}`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ can_view_financeiro: true })
      .expect(403);
  });

  it("Dono NÃO remove o próprio acesso: owner ignora os flags (desliga em si e segue com acesso total)", async () => {
    const ownerToken = await login("dono@perm.dev");
    // Dono tenta se autolimitar (o serviço NÃO persiste flags no owner).
    await setFlags(ownerToken, ownerId, {
      can_manage_all_appointments: false,
      can_view_financeiro: false,
    }).expect(200);
    // Mesmo assim segue tratando pendentes na hora (owner sempre pode).
    await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
  });

  it("'basic' aposentado: PATCH access_level:'basic' → 400 (só 'manager' é aceito)", async () => {
    const ownerToken = await login("dono@perm.dev");
    await setFlags(ownerToken, managerId, { access_level: "basic" }).expect(400);
  });
});
