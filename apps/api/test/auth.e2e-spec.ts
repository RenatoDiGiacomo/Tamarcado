import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

const EMAIL = "dono@teste.dev";
const PASSWORD = "senha123";

describe("Auth (e2e)", () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);

    const company = await ctx.dataSource
      .getRepository(Company)
      .save(
        ctx.dataSource
          .getRepository(Company)
          .create({ name: "Salão Teste", slug: "salao-teste" }),
      );
    await ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        company_id: company.id,
        name: "Dono Teste",
        email: EMAIL,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  it("POST /api/auth/login com credenciais válidas -> 200 + tokens", async () => {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it("POST /api/auth/login com senha errada -> 401", async () => {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: "errada" });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login com email inválido -> 400 (validação)", async () => {
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "naoehemail", password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/refresh com refresh válido -> 200 + novo access", async () => {
    const login = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const res = await request(ctx.app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("GET /api/users/me sem token -> 401", async () => {
    const res = await request(ctx.app.getHttpServer()).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/users/me com token -> 200 + perfil", async () => {
    const login = await request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const res = await request(ctx.app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(EMAIL);
    expect(res.body.accessLevel).toBe("owner");
    expect(res.body.companyId).toBeDefined();
  });
});
