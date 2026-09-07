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
 * Story 6.11 — Capabilities por empresa (DL-072, reescreve o DL-057).
 *
 * Prova, ponta a ponta, o que a story não pode entregar errado:
 *  - CAMADA 2: empresa SEM a capability leva **403**; COM, leva 200. O front
 *    pode mostrar o que quiser — a segurança é este 403.
 *  - AS CAMADAS SÃO INDEPENDENTES: capability é da EMPRESA, visibilidade de
 *    módulo é da PESSOA (DL-062). Empresa com o recurso + pessoa sem o módulo =
 *    bloqueado; e o inverso também. Nenhuma substitui a outra.
 *  - O OWNER NÃO PASSA POR CIMA da capability (ao contrário do ModuleGuard, onde
 *    ele passa sempre): papel não compra recurso.
 *  - LINHA FRESCA, NUNCA O TOKEN: revogar corta o acesso na requisição seguinte,
 *    com o MESMO token, sem relogar — mesma disciplina do DL-062. É o que faz o
 *    corte de um cliente valer na hora (Story 6.16).
 *  - ISOLAMENTO: a capability de uma empresa não libera nada na outra.
 *
 * As rotas gateadas vêm da fixture `CapabilityProbeModule` — nenhum recurso de
 * produção é gateado ainda (o bot é a 6.1). Ver o cabeçalho da fixture.
 */
jest.setTimeout(60000);

describe("Gate por capability (e2e, DL-072 — Story 6.11)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  let comCapability = "";
  let semCapability = "";

  const api = () => request(ctx.app.getHttpServer());

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
  ): Promise<string> {
    const repo = ctx.dataSource.getRepository(User);
    const user = await repo.save(
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
    return user.id;
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

  async function revoke(
    companyId: string,
    capability: CapabilityKey,
  ): Promise<void> {
    await ctx.dataSource
      .getRepository(CompanyCapability)
      .delete({ company_id: companyId, capability });
  }

  async function login(email: string, slug: string): Promise<string> {
    const res = await api()
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, companySlug: slug });
    return res.body.accessToken as string;
  }

  const auth = (token: string): [string, string] => [
    "Authorization",
    "Bearer " + token,
  ];

  beforeAll(async () => {
    ctx = await bootstrapE2E([CapabilityProbeModule]);
    await resetSchema(ctx.dataSource);

    comCapability = await seedCompany("salao-com-cap");
    semCapability = await seedCompany("salao-sem-cap");

    // A empresa COM contratou as duas metades do WhatsApp (preset do Pró).
    await grant(comCapability, "whatsapp_bot");
    await grant(comCapability, "lembrete_automatico");

    await seedUser(comCapability, "dono@com.dev", "owner");
    await seedUser(comCapability, "prof@com.dev", "professional");
    await seedUser(comCapability, "prof-fin@com.dev", "professional", true);
    await seedUser(semCapability, "dono@sem.dev", "owner");
    await seedUser(semCapability, "prof-fin@sem.dev", "professional", true);
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  describe("camada 2 — o 403 do backend", () => {
    it("empresa SEM a capability recebe 403", async () => {
      const token = await login("dono@sem.dev", "salao-sem-cap");
      await api().get("/api/__probe/bot").set(...auth(token)).expect(403);
    });

    it("empresa COM a capability recebe 200", async () => {
      const token = await login("dono@com.dev", "salao-com-cap");
      await api().get("/api/__probe/bot").set(...auth(token)).expect(200);
    });

    it("rota sem @RequireCapability não é afetada pelo gate", async () => {
      const token = await login("dono@sem.dev", "salao-sem-cap");
      await api().get("/api/__probe/aberto").set(...auth(token)).expect(200);
    });

    it("sem autenticação continua 401 (o gate não substitui o login)", async () => {
      await api().get("/api/__probe/bot").expect(401);
    });

    it("o OWNER da empresa sem a capability também recebe 403", async () => {
      // Diferente do ModuleGuard (DL-062), onde `owner` passa sempre: lá é
      // permissão interna da equipe; aqui é o que a EMPRESA comprou.
      const token = await login("dono@sem.dev", "salao-sem-cap");
      await api().get("/api/__probe/bot-owner").set(...auth(token)).expect(403);
    });
  });

  describe("as camadas são INDEPENDENTES (capability ≠ visibilidade de módulo)", () => {
    it("empresa TEM a capability e a pessoa NÃO vê o módulo: bloqueado", async () => {
      const token = await login("prof@com.dev", "salao-com-cap");
      // A capability sozinha passa...
      await api().get("/api/__probe/bot").set(...auth(token)).expect(200);
      // ...mas a rota que também exige o módulo, não.
      await api()
        .get("/api/__probe/bot-financeiro")
        .set(...auth(token))
        .expect(403);
    });

    it("pessoa VÊ o módulo e a empresa NÃO tem a capability: bloqueado", async () => {
      const token = await login("prof-fin@sem.dev", "salao-sem-cap");
      // A visibilidade de módulo sozinha passa...
      await api().get("/api/__probe/financeiro").set(...auth(token)).expect(200);
      // ...mas não compra o recurso da empresa.
      await api()
        .get("/api/__probe/bot-financeiro")
        .set(...auth(token))
        .expect(403);
    });

    it("as DUAS presentes: 200 (nenhuma substitui a outra)", async () => {
      const token = await login("prof-fin@com.dev", "salao-com-cap");
      await api()
        .get("/api/__probe/bot-financeiro")
        .set(...auth(token))
        .expect(200);
    });
  });

  describe("linha fresca, nunca o token (mesma disciplina do DL-062)", () => {
    it("revogar corta o acesso na requisição SEGUINTE, com o MESMO token", async () => {
      const token = await login("dono@com.dev", "salao-com-cap");
      await api().get("/api/__probe/bot").set(...auth(token)).expect(200);

      await revoke(comCapability, "whatsapp_bot");

      // Sem relogar e sem esperar o token expirar: o corte vale AGORA. É o que
      // torna a Story 6.16 (ativação/corte manual) útil de verdade.
      await api().get("/api/__probe/bot").set(...auth(token)).expect(403);

      // E conceder de volta reabre, também na requisição seguinte.
      await grant(comCapability, "whatsapp_bot");
      await api().get("/api/__probe/bot").set(...auth(token)).expect(200);
    });
  });

  describe("isolamento por tenant (ADR-002)", () => {
    it("a capability de uma empresa não libera nada na outra", async () => {
      const daOutra = await login("dono@sem.dev", "salao-sem-cap");
      await api().get("/api/__probe/bot").set(...auth(daOutra)).expect(403);

      const linhas = await ctx.dataSource
        .getRepository(CompanyCapability)
        .find({ where: { company_id: semCapability } });
      expect(linhas).toEqual([]);
    });
  });

  describe("exposição ao front — camada 1 (UX, não segurança)", () => {
    it("/users/me devolve as capabilities da EMPRESA, separadas dos flags da pessoa", async () => {
      const token = await login("prof@com.dev", "salao-com-cap");
      const res = await api()
        .get("/api/users/me")
        .set(...auth(token))
        .expect(200);

      // Eixo da EMPRESA: o que ela comprou.
      expect([...res.body.companyCapabilities].sort()).toEqual([
        "lembrete_automatico",
        "whatsapp_bot",
      ]);
      // Eixo da PESSOA: continua intacto e separado (DL-062).
      expect(res.body.canViewFinanceiro).toBe(false);
      expect(res.body.accessLevel).toBe("professional");
    });

    it("empresa sem nada contratado devolve lista vazia (não `undefined`)", async () => {
      const token = await login("dono@sem.dev", "salao-sem-cap");
      const res = await api()
        .get("/api/users/me")
        .set(...auth(token))
        .expect(200);
      expect(res.body.companyCapabilities).toEqual([]);
    });

    it("o polling do front converge: revogar reflete no /users/me seguinte", async () => {
      const token = await login("dono@com.dev", "salao-com-cap");
      await revoke(comCapability, "lembrete_automatico");
      const res = await api()
        .get("/api/users/me")
        .set(...auth(token))
        .expect(200);
      expect(res.body.companyCapabilities).toEqual(["whatsapp_bot"]);
      await grant(comCapability, "lembrete_automatico");
    });
  });
});
