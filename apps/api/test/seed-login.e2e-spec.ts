import request from "supertest";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";
import {
  seedDev,
  SEED_OWNER_EMAIL,
  SEED_OWNER_PASSWORD,
} from "../src/database/seeds/seed-dev";

/**
 * Guarda dois pontos que quebraram em DEV na 1.2/1.3:
 * 1. A credencial gerada pelo SEED real loga (hash do seed casa com o AuthService).
 * 2. O CORS está habilitado para a origem do painel (sem isso o login falha no
 *    navegador, mesmo a API respondendo 200 via curl/supertest).
 */
describe("Login com seed dev + CORS (e2e)", () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
    await seedDev(ctx.dataSource);
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("loga com a credencial do seed (dono@tamarcado.dev) -> 200 + tokens", async () => {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: SEED_OWNER_EMAIL, password: SEED_OWNER_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it("preflight CORS libera a origem do painel web", async () => {
    const res = await request(ctx.app.getHttpServer())
      .options("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
});
