import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { UserInvite } from "../src/database/entities/user-invite.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { Appointment } from "../src/database/entities/appointment.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 1.9 — Provisionamento de estabelecimento (endpoint de plataforma).
 * Cobre: proteção por x-platform-key (401), slug malformado (400), slug
 * duplicado (409), criação bem-sucedida com convite do owner (201) SEM criar
 * serviços/horários/senha, e — o principal — provisionar DUAS empresas e provar
 * que cada owner, após aceitar o convite, só enxerga os dados da PRÓPRIA (DL-027).
 */
jest.setTimeout(60000);

// A chave da plataforma vem do ambiente (nunca do repo). Definida ANTES do
// bootstrap para o ConfigModule enxergar no init.
const PLATFORM_KEY = "test-platform-key-1234";
process.env.PLATFORM_KEY = PLATFORM_KEY;

describe("Provisionamento de estabelecimento (e2e)", () => {
  let ctx: E2EContext;
  const api = () => request(ctx.app.getHttpServer());
  const provision = (body: object, key: string | null = PLATFORM_KEY) => {
    const req = api().post("/api/platform/companies");
    if (key !== null) req.set("x-platform-key", key);
    return req.send(body);
  };
  const validBody = {
    name: "Salão da Ana",
    slug: "salao-da-ana",
    ownerName: "Ana Dona",
    ownerEmail: "ana@salao.dev",
  };

  beforeEach(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
  });
  afterEach(async () => {
    await teardownE2E(ctx);
  });

  it("sem a chave / com chave errada → 401 (não cria nada)", async () => {
    await provision(validBody, null).expect(401);
    await provision(validBody, "chave-errada").expect(401);
    expect(await ctx.dataSource.getRepository(Company).count()).toBe(0);
  });

  it("slug malformado → 400 (maiúscula, espaço, acento, especial)", async () => {
    for (const slug of ["Salao", "salao ana", "salão", "salao_ana", "salao!"]) {
      await provision({ ...validBody, slug }).expect(400);
    }
    expect(await ctx.dataSource.getRepository(Company).count()).toBe(0);
  });

  it("ownerEmail inválido → 400", async () => {
    await provision({ ...validBody, ownerEmail: "nao-e-email" }).expect(400);
  });

  it("cria a company + convite do owner (201) e devolve as URLs; NÃO cria serviço/horário/senha", async () => {
    const res = await provision(validBody).expect(201);
    expect(res.body).toEqual({
      slug: "salao-da-ana",
      painelUrl: expect.stringContaining("/app/salao-da-ana/login"),
      publicUrl: expect.stringContaining("/agendar/salao-da-ana"),
      inviteUrl: expect.stringContaining("/aceitar-convite?token="),
    });

    const company = await ctx.dataSource
      .getRepository(Company)
      .findOneOrFail({ where: { slug: "salao-da-ana" } });
    expect(company.name).toBe("Salão da Ana");

    // Convite do owner criado e pendente; SEM usuário ainda (senha só no aceite).
    const invites = await ctx.dataSource
      .getRepository(UserInvite)
      .find({ where: { company_id: company.id } });
    expect(invites).toHaveLength(1);
    expect(invites[0].email).toBe("ana@salao.dev");
    expect(invites[0].access_level).toBe("owner");
    expect(invites[0].accepted_at).toBeNull();
    expect(
      await ctx.dataSource
        .getRepository(User)
        .count({ where: { company_id: company.id } }),
    ).toBe(0);

    // NÃO provisiona serviços nem agendamentos de exemplo.
    expect(
      await ctx.dataSource
        .getRepository(SalonService)
        .count({ where: { company_id: company.id } }),
    ).toBe(0);
    expect(
      await ctx.dataSource
        .getRepository(Appointment)
        .count({ where: { company_id: company.id } }),
    ).toBe(0);
  });

  it("slug duplicado → 409", async () => {
    await provision(validBody).expect(201);
    await provision({ ...validBody, ownerEmail: "outra@salao.dev" }).expect(409);
    expect(
      await ctx.dataSource
        .getRepository(Company)
        .count({ where: { slug: "salao-da-ana" } }),
    ).toBe(1);
  });

  it("superfície mínima: só POST (GET /platform/companies → 404)", async () => {
    await api().get("/api/platform/companies").expect(404);
  });

  it("DUAS empresas: cada owner, após aceitar, só vê os dados da própria (isolamento)", async () => {
    const tokenFromUrl = (url: string): string =>
      new URL(url).searchParams.get("token") as string;

    const a = (
      await provision({
        name: "Salão A",
        slug: "salao-a",
        ownerName: "Owner A",
        ownerEmail: "owner-a@salao.dev",
      }).expect(201)
    ).body;
    const b = (
      await provision({
        name: "Salão B",
        slug: "salao-b",
        ownerName: "Owner B",
        ownerEmail: "owner-b@salao.dev",
      }).expect(201)
    ).body;

    // Cada owner define a senha pelo aceite (auto-login devolve o token).
    const acceptA = await api()
      .post("/api/auth/accept-invite")
      .send({ token: tokenFromUrl(a.inviteUrl), password: "senha123" })
      .expect(200);
    const acceptB = await api()
      .post("/api/auth/accept-invite")
      .send({ token: tokenFromUrl(b.inviteUrl), password: "senha123" })
      .expect(200);
    const tokA = acceptA.body.accessToken as string;
    const tokB = acceptB.body.accessToken as string;

    // Cada token só enxerga usuários da própria empresa (tenant-scoped).
    const usersA = await api()
      .get("/api/users")
      .set("Authorization", `Bearer ${tokA}`)
      .expect(200);
    const usersB = await api()
      .get("/api/users")
      .set("Authorization", `Bearer ${tokB}`)
      .expect(200);

    const emailsA = usersA.body.users.map((u: { email: string }) => u.email);
    const emailsB = usersB.body.users.map((u: { email: string }) => u.email);
    expect(emailsA).toEqual(["owner-a@salao.dev"]);
    expect(emailsB).toEqual(["owner-b@salao.dev"]);
    expect(emailsA).not.toContain("owner-b@salao.dev");
    expect(emailsB).not.toContain("owner-a@salao.dev");
  });
});
