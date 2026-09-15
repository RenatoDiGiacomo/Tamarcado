import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import type { AccessLevel } from "../src/database/entities/user.entity";
import { CompanyCapability } from "../src/database/entities/company-capability.entity";
import type { CapabilityKey } from "../src/common/capabilities/capability";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";
import { CapabilityProbeModule } from "./fixtures/capability-probe.module";

/**
 * Story 6.15 — os TRÊS 403 chegam DISTINGUÍVEIS ao front.
 *
 * Depois da 6.11 existem três motivos de 403, e para quem está na tela eles são
 * coisas diferentes:
 *  - `capability`: a EMPRESA não contratou → há o que contratar (venda);
 *  - `module`: a PESSOA não tem o módulo → falar com o dono;
 *  - `role`: o PAPEL não permite → falar com o dono.
 *
 * Sem a marca no CORPO da resposta, o front só poderia adivinhar pelo texto da
 * mensagem ou pela rota — heurística que quebra no primeiro ajuste de copy. E o
 * pior caso não é técnico: tratar os três igual faria a profissional SEM
 * PERMISSÃO receber oferta de plano que ela não tem como comprar.
 */
jest.setTimeout(60000);

describe("403 distinguível por motivo (e2e — Story 6.15)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  let comCapability = "";
  let semCapability = "";

  const api = () => request(ctx.app.getHttpServer());
  const auth = (token: string): [string, string] => [
    "Authorization",
    "Bearer " + token,
  ];

  async function seedCompany(slug: string): Promise<string> {
    const repo = ctx.dataSource.getRepository(Company);
    const company = await repo.save(repo.create({ name: slug, slug }));
    return company.id;
  }

  async function seedUser(
    companyId: string,
    email: string,
    accessLevel: AccessLevel,
    canViewFinanceiro = false,
  ): Promise<void> {
    const repo = ctx.dataSource.getRepository(User);
    await repo.save(
      repo.create({
        company_id: companyId,
        name: email,
        email,
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: accessLevel,
        attends_clients: false,
        theme: "light",
        is_active: true,
        can_view_financeiro: canViewFinanceiro,
      }),
    );
  }

  async function grant(
    companyId: string,
    capability: CapabilityKey,
  ): Promise<void> {
    const repo = ctx.dataSource.getRepository(CompanyCapability);
    await repo.save(
      repo.create({ company_id: companyId, capability, granted_by: "e2e" }),
    );
  }

  async function login(email: string, slug: string): Promise<string> {
    const res = await api()
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: slug });
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E([CapabilityProbeModule]);
    await resetSchema(ctx.dataSource);

    comCapability = await seedCompany("salao-403-com");
    semCapability = await seedCompany("salao-403-sem");
    await grant(comCapability, "whatsapp_bot");
    await grant(comCapability, "lembrete_automatico");

    // Na empresa COM o plano: uma profissional SEM o módulo Financeiro. É ela
    // que provaria o defeito — receberia oferta de plano que o salão já tem.
    await seedUser(comCapability, "prof@com.dev", "professional", false);
    await seedUser(comCapability, "dono@com.dev", "owner");
    await seedUser(semCapability, "dono@sem.dev", "owner");
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  describe("motivo `capability` — a empresa não contratou", () => {
    it("403 com reason `capability` e a chave do recurso", async () => {
      const token = await login("dono@sem.dev", "salao-403-sem");
      const res = await api()
        .get("/api/__probe/bot")
        .set(...auth(token))
        .expect(403);
      expect(res.body.reason).toBe("capability");
      expect(res.body.capability).toBe("whatsapp_bot");
      // O front precisa da chave para escolher o texto de venda certo.
      expect(res.body.module).toBeUndefined();
    });

    it("o OWNER recebe o mesmo motivo — papel não compra recurso", async () => {
      const token = await login("dono@sem.dev", "salao-403-sem");
      const res = await api()
        .get("/api/__probe/bot-owner")
        .set(...auth(token))
        .expect(403);
      expect(res.body.reason).toBe("capability");
      expect(res.body.capability).toBe("lembrete_automatico");
    });
  });

  describe("motivo `module` — a pessoa não tem o módulo", () => {
    it("403 com reason `module` e SEM chave de capability", async () => {
      const token = await login("prof@com.dev", "salao-403-com");
      const res = await api()
        .get("/api/__probe/financeiro")
        .set(...auth(token))
        .expect(403);
      expect(res.body.reason).toBe("module");
      expect(res.body.module).toBe("financeiro");
      // Se `capability` vazasse aqui, a tela ofereceria plano a quem não compra.
      expect(res.body.capability).toBeUndefined();
    });

    it("rota que exige as DUAS: a capability é checada antes, e o motivo é o dela", async () => {
      // Empresa SEM o plano + pessoa sem o módulo. O primeiro obstáculo é
      // comercial, e é ele que o dono precisa ver.
      const token = await login("dono@sem.dev", "salao-403-sem");
      const res = await api()
        .get("/api/__probe/bot-financeiro")
        .set(...auth(token))
        .expect(403);
      expect(res.body.reason).toBe("capability");
    });
  });

  describe("motivo `role` — o papel não permite (o terceiro 403)", () => {
    it("403 com reason `role`, sem capability e sem módulo", async () => {
      // Rota real owner-only: profissional tentando convidar alguém.
      const token = await login("prof@com.dev", "salao-403-com");
      const res = await api()
        .post("/api/users/invite")
        .set(...auth(token))
        .send({ name: "X", email: "x@y.dev", access_level: "professional" })
        .expect(403);
      expect(res.body.reason).toBe("role");
      expect(res.body.capability).toBeUndefined();
      expect(res.body.module).toBeUndefined();
    });
  });

  describe("os três são de fato distintos (é o ponto da story)", () => {
    it("cada barreira devolve o SEU motivo, e nenhum se confunde com o outro", async () => {
      const semPlano = await login("dono@sem.dev", "salao-403-sem");
      const semModulo = await login("prof@com.dev", "salao-403-com");

      const [porPlano, porModulo, porPapel] = await Promise.all([
        api().get("/api/__probe/bot").set(...auth(semPlano)),
        api().get("/api/__probe/financeiro").set(...auth(semModulo)),
        api()
          .post("/api/users/invite")
          .set(...auth(semModulo))
          .send({ name: "X", email: "z@y.dev", access_level: "professional" }),
      ]);

      const motivos = [porPlano, porModulo, porPapel].map((r) => r.body.reason);
      expect(motivos).toEqual(["capability", "module", "role"]);
      expect(new Set(motivos).size).toBe(3);
    });

    it("nenhuma mensagem cita preço — quem vende é a tela (DL-075)", async () => {
      const token = await login("dono@sem.dev", "salao-403-sem");
      const res = await api().get("/api/__probe/bot").set(...auth(token));
      expect(String(res.body.message)).not.toMatch(/R\$|\d+[,.]\d{2}|reais/i);
    });
  });

  describe("o que NÃO pode mudar", () => {
    it("com o direito e o módulo, a rota continua 200", async () => {
      const token = await login("dono@com.dev", "salao-403-com");
      await api()
        .get("/api/__probe/bot-financeiro")
        .set(...auth(token))
        .expect(200);
    });

    it("sem autenticação continua 401 — o motivo não substitui o login", async () => {
      await api().get("/api/__probe/bot").expect(401);
    });
  });
});
