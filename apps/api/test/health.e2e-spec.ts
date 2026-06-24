import request from "supertest";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

describe("Health (e2e)", () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("GET /health -> 200 { status: 'ok' }", async () => {
    const res = await request(ctx.app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
