import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import * as bcrypt from "bcryptjs";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

const EMAIL = "dono@teste.dev";
const PASSWORD = "senha123";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ds = await createTestDataSource();
    await resetSchema(ds);

    const company = await ds
      .getRepository(Company)
      .save(ds.getRepository(Company).create({ name: "Salão Teste", slug: "salao-teste" }));
    await ds.getRepository(User).save(
      ds.getRepository(User).create({
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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", { exclude: ["health"] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (ds?.isInitialized) {
      await dropSchema(ds);
      await ds.destroy();
    }
  });

  it("POST /api/auth/login com credenciais válidas -> 200 + tokens", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it("POST /api/auth/login com senha errada -> 401", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: "errada" });
    expect(res.status).toBe(401);
  });

  it("POST /api/auth/login com email inválido -> 400 (validação)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "naoehemail", password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/refresh com refresh válido -> 200 + novo access", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const res = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("GET /api/users/me sem token -> 401", async () => {
    const res = await request(app.getHttpServer()).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/users/me com token -> 200 + perfil", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    const res = await request(app.getHttpServer())
      .get("/api/users/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(EMAIL);
    expect(res.body.accessLevel).toBe("owner");
    expect(res.body.companyId).toBeDefined();
  });
});
