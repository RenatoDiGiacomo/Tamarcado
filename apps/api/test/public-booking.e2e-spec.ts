import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { SalonService } from "../src/database/entities/salon-service.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 5B.1 — fundação pública por slug. Cobre o ISOLAMENTO (primeiro, TDD): a
 * rota pública `/api/public/:slug/*` resolve o tenant SÓ pelo slug (sem login) e
 * NUNCA vaza dados de outro salão. Endpoints: branding whitelisted, serviços
 * ativos e profissionais ativos. Slug inexistente → 404.
 */
jest.setTimeout(60000);

describe("Fundação pública por slug (e2e)", () => {
  let ctx: E2EContext;
  let companyA = "";
  let companyB = "";

  async function seedCompany(
    slug: string,
    name: string,
    logo: string,
    color: string,
  ): Promise<string> {
    const repo = ctx.dataSource.getRepository(Company);
    const c = await repo.save(
      repo.create({
        name,
        slug,
        logo_url: logo,
        primary_color: color,
        timezone: "America/Sao_Paulo",
      }),
    );
    return c.id;
  }
  async function seedService(
    companyId: string,
    name: string,
    active: boolean,
  ): Promise<void> {
    const repo = ctx.dataSource.getRepository(SalonService);
    await repo.save(
      repo.create({
        company_id: companyId,
        name,
        duration_minutes: 60,
        price: "50.00",
        is_active: active,
      }),
    );
  }
  async function seedUser(
    companyId: string,
    name: string,
    attends: boolean,
    active: boolean,
  ): Promise<void> {
    const repo = ctx.dataSource.getRepository(User);
    await repo.save(
      repo.create({
        company_id: companyId,
        name,
        email: `${name.replace(/\s/g, "").toLowerCase()}@${companyId}.dev`,
        password_hash: "x",
        access_level: "basic",
        attends_clients: attends,
        theme: "light",
        is_active: active,
      }),
    );
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    companyA = await seedCompany("salao-a", "Salão A", "https://a/logo.png", "#B85C38");
    companyB = await seedCompany("salao-b", "Salão B", "https://b/logo.png", "#6B7A3F");

    await seedService(companyA, "Corte A", true);
    await seedService(companyA, "Inativo A", false);
    await seedService(companyB, "Corte B", true);

    await seedUser(companyA, "Ana A", true, true); // atende + ativo
    await seedUser(companyA, "Recep A", false, true); // não atende
    await seedUser(companyA, "Inativa A", true, false); // inativa
    await seedUser(companyB, "Bruno B", true, true);
  }, 60000);

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  const api = () => request(ctx.app.getHttpServer());

  it("installation: retorna o branding do salão do slug (sem login)", async () => {
    const res = await api().get("/api/public/salao-a/installation");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "Salão A",
      logoUrl: "https://a/logo.png",
      primaryColor: "#B85C38",
    });
  });

  it("installation: whitelist estrita — nada além de name/logoUrl/primaryColor", async () => {
    const res = await api().get("/api/public/salao-a/installation");
    expect(Object.keys(res.body).sort()).toEqual(["logoUrl", "name", "primaryColor"]);
    expect(res.body).not.toHaveProperty("businessHoursStart");
    expect(res.body).not.toHaveProperty("timezone");
    expect(res.body).not.toHaveProperty("id");
  });

  it("services: só os ATIVOS do salão do slug (nunca inativos nem de outro)", async () => {
    const res = await api().get("/api/public/salao-a/services");
    expect(res.status).toBe(200);
    const names = (res.body.services as { name: string }[]).map((s) => s.name);
    expect(names).toEqual(["Corte A"]);
    expect(names).not.toContain("Inativo A");
    expect(names).not.toContain("Corte B");
    const s = res.body.services[0];
    expect(Object.keys(s).sort()).toEqual(["durationMinutes", "id", "name", "price"]);
  });

  it("professionals: só os que ATENDEM e estão ATIVOS do salão do slug", async () => {
    const res = await api().get("/api/public/salao-a/professionals");
    expect(res.status).toBe(200);
    const names = (res.body.professionals as { name: string }[]).map((p) => p.name);
    expect(names).toEqual(["Ana A"]);
    expect(names).not.toContain("Recep A");
    expect(names).not.toContain("Inativa A");
    expect(names).not.toContain("Bruno B");
  });

  it("ISOLAMENTO: o slug B nunca devolve dados de A", async () => {
    const inst = await api().get("/api/public/salao-b/installation");
    expect(inst.body.name).toBe("Salão B");
    const svc = await api().get("/api/public/salao-b/services");
    expect((svc.body.services as { name: string }[]).map((s) => s.name)).toEqual(["Corte B"]);
    const prof = await api().get("/api/public/salao-b/professionals");
    expect((prof.body.professionals as { name: string }[]).map((p) => p.name)).toEqual(["Bruno B"]);
  });

  it("slug inexistente → 404 em todos os endpoints", async () => {
    await api().get("/api/public/nao-existe/installation").expect(404);
    await api().get("/api/public/nao-existe/services").expect(404);
    await api().get("/api/public/nao-existe/professionals").expect(404);
  });

  it("não exige autenticação (sem Authorization header) → 200", async () => {
    const res = await api().get("/api/public/salao-a/installation");
    expect(res.status).toBe(200);
    expect(companyA).not.toBe(companyB); // sanity dos ids seedados
  });
});