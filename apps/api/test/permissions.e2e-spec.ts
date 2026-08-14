import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 5.1 — Fundação de permissões (DL-062).
 * Prova, ponta a ponta:
 *  - REVOGAÇÃO IMEDIATA: o Dono desliga um flag e a PRÓXIMA requisição do
 *    usuário (MESMO token, sem relogar) já é 403 — porque a autorização lê a
 *    linha FRESCA do banco a cada request (ActiveUserGuard → @Actor/ModuleGuard),
 *    não o token. É a comprovação que substitui o screenshot da revogação.
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
    managerId = (await seedUser("gestao@perm.dev", "manager", true)).id;
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

  it("REVOGAÇÃO IMEDIATA: Dono liga o escopo de agenda → 200; desliga → a PRÓXIMA requisição (mesmo token) já é 403", async () => {
    const ownerToken = await login("dono@perm.dev");
    const managerToken = await login("gestao@perm.dev"); // capturado UMA vez

    // Sem o flag, a Gestão não trata a fila de pendentes (operação de equipe).
    await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(403);

    // Dono LIGA can_manage_all_appointments.
    await setFlags(ownerToken, managerId, {
      can_manage_all_appointments: true,
    }).expect(200);

    // MESMO token → agora 200, sem relogar.
    await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(200);

    // Dono REVOGA.
    await setFlags(ownerToken, managerId, {
      can_manage_all_appointments: false,
    }).expect(200);

    // MESMO token → a PRÓXIMA requisição JÁ é 403. Revogação imediata.
    await api()
      .get("/api/appointments/pending")
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(403);
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
