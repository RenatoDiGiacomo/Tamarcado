import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 1.4 — gestão de equipe e permissões (AC1–AC6).
 * Convite por link + aceite, matriz FR-I2 (RolesGuard), edição dos dois eixos,
 * Dono único (bloqueio) e revogação imediata ao desativar (ActiveUserGuard).
 */
// Bootstrap do AppModule (compile ts-jest a frio) + bcrypt no seed passam dos
// 5s padrão do Jest na primeira suíte — folga generosa para hooks e testes.
jest.setTimeout(60000);

describe("Gestão de equipe e permissões (e2e)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-eq";
  let ownerId = "";

  async function seedUser(
    companyId: string,
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

  async function login(email: string): Promise<string> {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: SLUG });
    return res.body.accessToken as string;
  }

  function tokenFromLink(link: string): string {
    return new URL(link).searchParams.get("token") ?? "";
  }

  /** Convida (como Dono) e aceita, devolvendo os tokens do novo usuário. */
  async function inviteAndAccept(
    ownerToken: string,
    email: string,
    accessLevel: "professional",
    attends: boolean,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const inv = await request(ctx.app.getHttpServer())
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: email, email, access_level: accessLevel, attends_clients: attends });
    expect(inv.status).toBe(201);
    const token = tokenFromLink(inv.body.link);
    const acc = await request(ctx.app.getHttpServer())
      .post("/api/auth/accept-invite")
      .send({ token, password: PASSWORD });
    expect(acc.status).toBe(200);
    return acc.body;
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({ name: "Salão Equipe", slug: SLUG }),
    );
    const owner = await seedUser(company.id, "dono@eq.dev", "owner", true);
    ownerId = owner.id;
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("AC1: Dono convida e recebe link de aceite", async () => {
    const ownerToken = await login("dono@eq.dev");
    const res = await request(ctx.app.getHttpServer())
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Convidada",
        email: "convidada@eq.dev",
        access_level: "professional",
        attends_clients: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.link).toContain("token=");
    expect(tokenFromLink(res.body.link)).toHaveLength(64);
  });

  it("AC1: aceite cria o usuário, auto-loga e permite login depois", async () => {
    const ownerToken = await login("dono@eq.dev");
    const inv = await request(ctx.app.getHttpServer())
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Ana",
        email: "ana@eq.dev",
        access_level: "professional",
        attends_clients: false,
      });
    const token = tokenFromLink(inv.body.link);

    const acc = await request(ctx.app.getHttpServer())
      .post("/api/auth/accept-invite")
      .send({ token, password: PASSWORD });
    expect(acc.status).toBe(200);
    expect(acc.body.accessToken).toBeDefined();

    // login posterior funciona
    const loginRes = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "ana@eq.dev", password: PASSWORD, companySlug: SLUG });
    expect(loginRes.status).toBe(200);

    // reutilizar o token do convite → 400 (uso único)
    const reuse = await request(ctx.app.getHttpServer())
      .post("/api/auth/accept-invite")
      .send({ token, password: PASSWORD });
    expect(reuse.status).toBe(400);
  });

  it("AC1: aceite com token inexistente → 400", async () => {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/accept-invite")
      .send({ token: "a".repeat(64), password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it("AC3: convidar como não-Dono → 403 (matriz FR-I2)", async () => {
    const basic = await inviteAndAccept(
      await login("dono@eq.dev"),
      "basico@eq.dev",
      "professional",
      true,
    );
    const res = await request(ctx.app.getHttpServer())
      .post("/api/users/invite")
      .set("Authorization", `Bearer ${basic.accessToken}`)
      .send({
        name: "X",
        email: "x@eq.dev",
        access_level: "professional",
        attends_clients: false,
      });
    expect(res.status).toBe(403);
  });

  it("AC2: edita access_level e attends_clients de forma independente", async () => {
    const ownerToken = await login("dono@eq.dev");
    const created = await seedUser(
      (await ctx.dataSource.getRepository(User).findOneByOrFail({ id: ownerId }))
        .company_id,
      "edit@eq.dev",
      "professional",
      false,
    );

    // muda só attends_clients → access_level permanece manager
    const r1 = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${created.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ attends_clients: true });
    expect(r1.status).toBe(200);
    expect(r1.body.accessLevel).toBe("professional");
    expect(r1.body.attendsClients).toBe(true);

    // muda só access_level → attends_clients permanece true
    const r2 = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${created.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ access_level: "professional" });
    expect(r2.status).toBe(200);
    expect(r2.body.accessLevel).toBe("professional");
    expect(r2.body.attendsClients).toBe(true);
  });

  it("AC5: bloqueia rebaixar ou desativar o único Dono (FR-I3)", async () => {
    const ownerToken = await login("dono@eq.dev");
    const demote = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${ownerId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ access_level: "professional" });
    expect(demote.status).toBe(409);

    const deactivate = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${ownerId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ is_active: false });
    expect(deactivate.status).toBe(409);
  });

  it("AC6: desativar revoga o token de acesso existente (na hora)", async () => {
    const ownerToken = await login("dono@eq.dev");
    const victim = await inviteAndAccept(
      ownerToken,
      "demitido@eq.dev",
      "professional",
      true,
    );

    // token funciona antes
    const before = await request(ctx.app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${victim.accessToken}`);
    expect(before.status).toBe(200);
    const victimId = before.body.id as string;

    // Dono desativa
    const off = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${victimId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ is_active: false });
    expect(off.status).toBe(200);

    // mesmo token agora → 401 (ActiveUserGuard)
    const after = await request(ctx.app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${victim.accessToken}`);
    expect(after.status).toBe(401);

    // login também barrado
    const relogin = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "demitido@eq.dev", password: PASSWORD, companySlug: SLUG });
    expect(relogin.status).toBe(401);
  });

  it("AC4: /users/attenders retorna só quem atende e está ativo", async () => {
    const ownerToken = await login("dono@eq.dev");
    const res = await request(ctx.app.getHttpServer())
      .get("/api/users/attenders")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.users.every(
        (u: { attendsClients: boolean; isActive: boolean }) =>
          u.attendsClients && u.isActive,
      ),
    ).toBe(true);
    // o Dono atende (seed attends=true) → presente
    const emails = res.body.users.map((u: { email: string }) => u.email);
    expect(emails).toContain("dono@eq.dev");
  });
});
