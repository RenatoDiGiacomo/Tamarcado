import * as bcrypt from "bcryptjs";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { User } from "../src/database/entities/user.entity";
import { CompanyCapability } from "../src/database/entities/company-capability.entity";
import { CompanyPlanChange } from "../src/database/entities/company-plan-change.entity";
import { CapabilitiesService } from "../src/modules/capabilities/capabilities.service";
import { PlatformRateLimitService } from "../src/modules/platform/platform-rate-limit.service";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";
import { CapabilityProbeModule } from "./fixtures/capability-probe.module";

/**
 * Story 6.16 — Ativação manual de plano pelo endpoint de plataforma (DL-076).
 *
 * O que este arquivo existe para impedir, em ordem de gravidade:
 *
 *  1. **Rebaixamento que não corta.** SUBIR é o caso fácil; o difícil é DESCER.
 *     O teste corta e verifica as TRÊS camadas do DL-072 na mesma transição —
 *     inclusive a camada 3, chamada FORA de requisição, que é a que o bot e o
 *     agendador usam e a que costuma ser esquecida.
 *  2. **Rebaixamento que apaga credencial de conexão.** Provado por SNAPSHOT de
 *     todas as tabelas: a única coisa que a troca de plano pode ter mudado é
 *     `company_capabilities`, `companies.plan` e o registro de auditoria. Isso é
 *     deliberadamente genérico — quando a Story 6.1 criar a tabela de
 *     credenciais, ela entra na cobertura sozinha, sem ninguém voltar aqui.
 *  3. **Plano aplicado sem registro de quem fez.** Auditoria verificada nas DUAS
 *     direções, com o antes e o depois.
 *  4. **Typo virando "ativei e não funcionou".** O `ValidationPipe` roda com
 *     `whitelist: true` e descartaria a chave errada em silêncio.
 *
 * A rota gateada vem da fixture `CapabilityProbeModule` (a mesma da 6.11):
 * nenhum recurso de produção é gateado por capability ainda — o bot é a 6.1 e a
 * tela é a 6.17.
 */
jest.setTimeout(60000);

const PLATFORM_KEY = "test-platform-key-6161";
process.env.PLATFORM_KEY = PLATFORM_KEY;

describe("Ativação manual de plano (e2e — Story 6.16, DL-076)", () => {
  let ctx: E2EContext;
  const PASSWORD = "senha123";
  const SLUG = "salao-do-teste";
  let companyId = "";

  const api = () => request(ctx.app.getHttpServer());

  const changePlan = (body: object, key: string | null = PLATFORM_KEY) => {
    const req = api().patch(`/api/platform/companies/${SLUG}/plan`);
    if (key !== null) req.set("x-platform-key", key);
    return req.send(body);
  };

  /** Token do DONO já logado — o mesmo em toda a suíte, de propósito. */
  async function login(): Promise<string> {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "dono@salao.dev", password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  /**
   * SNAPSHOT do banco inteiro: toda linha de toda tabela, ordenada. É o que
   * transforma "não apaga a credencial" num invariante verificável hoje, antes
   * de a tabela de credenciais existir.
   */
  async function snapshotBanco(): Promise<Record<string, unknown[]>> {
    const tabelas: { TABLE_NAME: string }[] = await ctx.dataSource.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
    );
    const snap: Record<string, unknown[]> = {};
    for (const { TABLE_NAME } of tabelas) {
      const nome = TABLE_NAME.toLowerCase();
      if (nome === "migrations") continue;
      snap[nome] = await ctx.dataSource.query(
        `SELECT * FROM \`${TABLE_NAME}\` ORDER BY 1`,
      );
    }
    return snap;
  }

  // A app e o schema sobem UMA vez: `bootstrapE2E` + `resetSchema` custam ~7s
  // cada, e repeti-los por teste transformaria este arquivo sozinho em mais de
  // dois minutos do shard de e2e. O isolamento entre os testes vem da limpeza
  // das LINHAS no `beforeEach`, abaixo.
  beforeAll(async () => {
    ctx = await bootstrapE2E([CapabilityProbeModule]);
    await resetSchema(ctx.dataSource);
  });

  afterAll(async () => {
    await teardownE2E(ctx);
  });

  beforeEach(async () => {
    // O rate limit do endpoint de plataforma é in-memory e por IP; com a app
    // subindo uma vez só, ele acumularia entre os testes e o 11º pedido viraria
    // 429. Zerar aqui mantém cada teste independente sem afrouxar o limite.
    ctx.app.get(PlatformRateLimitService).reset();

    // FK-safe: `companies` é pai de tudo aqui.
    await ctx.dataSource.query("DELETE FROM company_whatsapp_connections");
    await ctx.dataSource.query("DELETE FROM company_plan_changes");
    await ctx.dataSource.query("DELETE FROM company_capabilities");
    await ctx.dataSource.query("DELETE FROM users");
    await ctx.dataSource.query("DELETE FROM companies");

    const companies = ctx.dataSource.getRepository(Company);
    const company = await companies.save(
      companies.create({ name: "Salão do Teste", slug: SLUG, plan: "basico" }),
    );
    companyId = company.id;

    const users = ctx.dataSource.getRepository(User);
    await users.save(
      users.create({
        company_id: companyId,
        name: "Dona do Salão",
        email: "dono@salao.dev",
        password_hash: await bcrypt.hash(PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
  });

  // ─── proteção do endpoint ────────────────────────────────────────────────

  it("sem a chave de plataforma / com chave errada → 401, e nada muda", async () => {
    await changePlan({ plan: "pro", changedBy: "renato" }, null).expect(401);
    await changePlan({ plan: "pro", changedBy: "renato" }, "errada").expect(401);

    expect(
      await ctx.dataSource.getRepository(CompanyCapability).count(),
    ).toBe(0);
    expect(await ctx.dataSource.getRepository(CompanyPlanChange).count()).toBe(
      0,
    );
  });

  it("empresa inexistente → 404", async () => {
    await api()
      .patch("/api/platform/companies/nao-existe/plan")
      .set("x-platform-key", PLATFORM_KEY)
      .send({ plan: "pro", changedBy: "renato" })
      .expect(404);
  });

  // ─── SUBIR: libera e reflete sem novo login ──────────────────────────────

  it("subir de plano libera a capability e reflete no MESMO token, sem relogar", async () => {
    // O dono entra ANTES da ativação — é o cenário real: ele está com o painel
    // aberto quando o pix cai.
    const token = await login();
    const bearer = { Authorization: `Bearer ${token}` };

    // Camada 1 (o que o front lê para decidir a coroa): sem o recurso.
    const antes = await api().get("/api/users/me").set(bearer).expect(200);
    expect(antes.body.companyCapabilities).toEqual([]);

    // Camada 2: a rota gateada responde 403.
    await api().get("/api/__probe/bot").set(bearer).expect(403);

    await changePlan({
      plan: "pro",
      changedBy: "renato",
      reason: "pix recebido 15/09",
    }).expect(200);

    // O MESMO token de antes — nenhum login novo, nenhum refresh. É isto que
    // faz a ativação valer na hora: o gate lê a linha fresca, nunca o token.
    const depois = await api().get("/api/users/me").set(bearer).expect(200);
    expect(depois.body.companyCapabilities.sort()).toEqual([
      "lembrete_automatico",
      "whatsapp_bot",
    ]);
    await api().get("/api/__probe/bot").set(bearer).expect(200);
  });

  it("a resposta devolve o antes/depois, não um 'ok'", async () => {
    const res = await changePlan({ plan: "pro", changedBy: "renato" }).expect(
      200,
    );
    expect(res.body).toMatchObject({
      slug: SLUG,
      planBefore: "basico",
      planAfter: "pro",
      capabilitiesBefore: [],
      revoked: [],
    });
    expect(res.body.granted.sort()).toEqual([
      "lembrete_automatico",
      "whatsapp_bot",
    ]);
  });

  // ─── DESCER: o caso que a spec não cobria ────────────────────────────────

  it("rebaixar corta em TODAS as camadas — inclusive fora de requisição", async () => {
    const token = await login();
    const bearer = { Authorization: `Bearer ${token}` };

    await changePlan({ plan: "pro", changedBy: "renato" }).expect(200);
    await api().get("/api/__probe/bot").set(bearer).expect(200);

    // A camada 3 é o webhook (chamado PELA META, sem login) e o agendador
    // (roda sozinho): sem contexto de request nenhum. É este caminho que o
    // `CapabilitiesService` atende com `companyId` explícito.
    const capabilities = ctx.app.get(CapabilitiesService);
    expect(await capabilities.hasCapability(companyId, "whatsapp_bot")).toBe(
      true,
    );

    await changePlan({
      plan: "basico",
      changedBy: "renato",
      reason: "inadimplente desde agosto",
    }).expect(200);

    // Camada 1 — o que o polling do AuthContext entrega ao front.
    const me = await api().get("/api/users/me").set(bearer).expect(200);
    expect(me.body.companyCapabilities).toEqual([]);

    // Camada 2 — o 403, com o MESMO token que funcionava um instante atrás.
    await api().get("/api/__probe/bot").set(bearer).expect(403);

    // Camada 3 — o bot e o lembrete param JUNTO. Se só as duas primeiras
    // cortassem, o bot seguiria respondendo cliente de empresa cortada e o
    // lembrete sairia cobrado no cartão de quem já não paga (DL-072).
    expect(await capabilities.hasCapability(companyId, "whatsapp_bot")).toBe(
      false,
    );
    expect(
      await capabilities.hasCapability(companyId, "lembrete_automatico"),
    ).toBe(false);
    expect(await capabilities.listForCompany(companyId)).toEqual([]);
  });

  it("rebaixar NÃO apaga nada além da capability — a credencial de conexão sobrevive", async () => {
    await changePlan({ plan: "pro", changedBy: "renato" }).expect(200);

    // Story 6.1: a tabela de credenciais existe agora, e o snapshot só prova
    // algo sobre ela se ela tiver LINHA. Sem esta semeadura, "a credencial
    // sobrevive" seria uma comparação entre duas tabelas vazias (DL-082).
    await ctx.dataSource.query(
      "INSERT INTO company_whatsapp_connections (company_id, provider, phone_number_id, waba_id, access_token, status, connected_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        companyId,
        "cloud_api",
        "PN-DO-SALAO",
        "1944290202933684",
        "v1:cifrado:cifrado:cifrado",
        "conectado",
        "manual:plataforma",
      ],
    );

    const antes = await snapshotBanco();
    await changePlan({ plan: "basico", changedBy: "renato" }).expect(200);
    const depois = await snapshotBanco();

    // As únicas tabelas que a troca de plano tem autorização para tocar.
    const PODE_MUDAR = new Set([
      "company_capabilities",
      "company_plan_changes",
      "companies", // só a coluna `plan`, conferida logo abaixo
    ]);

    expect(Object.keys(depois).sort()).toEqual(Object.keys(antes).sort());
    for (const tabela of Object.keys(antes)) {
      if (PODE_MUDAR.has(tabela)) continue;
      // Quando a Story 6.1 criar a tabela de credenciais do WhatsApp, ela cai
      // AQUI sozinha: rebaixar desliga o uso, não destrói o vínculo com a Meta.
      expect({ [tabela]: depois[tabela] }).toEqual({ [tabela]: antes[tabela] });
    }

    // Em `companies`, só o rótulo comercial mudou — nome, slug e configuração
    // do salão ficam intactos.
    const companyAntes = (antes.companies as Record<string, unknown>[])[0];
    const companyDepois = (depois.companies as Record<string, unknown>[])[0];
    expect(companyAntes.plan).toBe("pro");
    expect(companyDepois.plan).toBe("basico");
    expect({ ...companyDepois, plan: null }).toEqual({
      ...companyAntes,
      plan: null,
    });
  });

  // ─── auditoria ───────────────────────────────────────────────────────────

  it("grava o registro de auditoria nas DUAS direções, com antes → depois", async () => {
    await changePlan({
      plan: "pro",
      changedBy: "renato",
      reason: "pix recebido 15/09",
    }).expect(200);
    await changePlan({
      plan: "basico",
      changedBy: "renato",
      reason: "inadimplente desde agosto",
    }).expect(200);

    const registros = await ctx.dataSource
      .getRepository(CompanyPlanChange)
      .find({ where: { company_id: companyId }, order: { id: "ASC" } });

    expect(registros).toHaveLength(2);

    const [ativacao, corte] = registros;
    expect(ativacao).toMatchObject({
      plan_before: "basico",
      plan_after: "pro",
      capabilities_before: [],
      changed_by: "renato",
      reason: "pix recebido 15/09",
    });
    expect([...ativacao.capabilities_after].sort()).toEqual([
      "lembrete_automatico",
      "whatsapp_bot",
    ]);
    expect(ativacao.ip).toBeTruthy();
    expect(ativacao.created_at).toBeInstanceOf(Date);

    // O CORTE é a metade que `company_capabilities` não guarda: revogar é
    // APAGAR a linha, então sem este registro o rebaixamento não deixaria
    // rastro nenhum.
    expect(corte).toMatchObject({
      plan_before: "pro",
      plan_after: "basico",
      capabilities_after: [],
      changed_by: "renato",
      reason: "inadimplente desde agosto",
    });
    expect([...corte.capabilities_before].sort()).toEqual([
      "lembrete_automatico",
      "whatsapp_bot",
    ]);
  });

  it("sem changedBy → 400 (plano aplicado sem registro de quem fez não passa)", async () => {
    await changePlan({ plan: "pro" }).expect(400);
    await changePlan({ plan: "pro", changedBy: "   " }).expect(400);
    expect(
      await ctx.dataSource.getRepository(CompanyCapability).count(),
    ).toBe(0);
  });

  // ─── venda avulsa e cortesia (a lista explícita) ─────────────────────────

  it("lista explícita concede sem mexer no plano — venda avulsa e cortesia", async () => {
    const res = await changePlan({
      capabilities: ["lembrete_automatico"],
      changedBy: "renato",
      reason: "cortesia até o fim do mês",
    }).expect(200);

    expect(res.body.capabilitiesAfter).toEqual(["lembrete_automatico"]);
    // O rótulo comercial NÃO muda: ela não comprou o pró, e registrar que
    // comprou seria mentir o histórico de venda (DL-072).
    expect(res.body.planAfter).toBe("basico");
    const company = await ctx.dataSource
      .getRepository(Company)
      .findOneByOrFail({ id: companyId });
    expect(company.plan).toBe("basico");
  });

  it("a lista é o ESTADO FINAL: [] revoga tudo", async () => {
    await changePlan({ plan: "pro", changedBy: "renato" }).expect(200);
    const res = await changePlan({
      capabilities: [],
      changedBy: "renato",
    }).expect(200);

    expect(res.body.capabilitiesAfter).toEqual([]);
    expect(res.body.revoked.sort()).toEqual([
      "lembrete_automatico",
      "whatsapp_bot",
    ]);
    expect(await ctx.dataSource.getRepository(CompanyCapability).count()).toBe(
      0,
    );
  });

  it("reconceder o que a empresa já tem não reescreve a data da concessão", async () => {
    await changePlan({
      capabilities: ["whatsapp_bot"],
      changedBy: "renato",
    }).expect(200);
    const repo = ctx.dataSource.getRepository(CompanyCapability);
    const original = await repo.findOneByOrFail({
      company_id: companyId,
      capability: "whatsapp_bot",
    });

    await changePlan({
      capabilities: ["whatsapp_bot", "lembrete_automatico"],
      changedBy: "renato",
    }).expect(200);

    const depois = await repo.findOneByOrFail({
      company_id: companyId,
      capability: "whatsapp_bot",
    });
    // `granted_at` é a data em que o direito passou a valer, não a da última
    // chamada do endpoint — é o que sustenta "desde quando ele tem isso".
    expect(depois.id).toBe(original.id);
    expect(depois.granted_at.getTime()).toBe(original.granted_at.getTime());
  });

  // ─── entrada inválida: falhar ALTO, nunca em silêncio ────────────────────

  it("capability desconhecida → 400 com erro claro, e nada é aplicado", async () => {
    const res = await changePlan({
      capabilities: ["whatsapp_bot", "wahtsapp_lembrete"],
      changedBy: "renato",
    }).expect(400);

    expect(JSON.stringify(res.body)).toContain("capability desconhecida");
    // Nem a chave VÁLIDA do mesmo corpo entra: a ordem é recusada inteira.
    expect(await ctx.dataSource.getRepository(CompanyCapability).count()).toBe(
      0,
    );
  });

  it("plano desconhecido → 400", async () => {
    await changePlan({ plan: "premium", changedBy: "renato" }).expect(400);
    expect(await ctx.dataSource.getRepository(CompanyCapability).count()).toBe(
      0,
    );
  });

  it("nem plan nem capabilities → 400 (o corpo não diz o que a empresa passa a ter)", async () => {
    const res = await changePlan({ changedBy: "renato" }).expect(400);
    expect(JSON.stringify(res.body)).toContain("capabilities");
  });

  it("plan E capabilities juntos → 400 (ordens contraditórias)", async () => {
    await changePlan({
      plan: "pro",
      capabilities: [],
      changedBy: "renato",
    }).expect(400);
    expect(await ctx.dataSource.getRepository(CompanyCapability).count()).toBe(
      0,
    );
  });

  it("campo com nome errado não vira ativação silenciosa", async () => {
    // O `whitelist: true` descarta `capabilies` (com o typo) sem avisar — o que
    // sobra é um corpo sem plan e sem capabilities, e ele PRECISA falhar.
    await changePlan({
      capabilies: ["whatsapp_bot"],
      changedBy: "renato",
    }).expect(400);
    expect(await ctx.dataSource.getRepository(CompanyCapability).count()).toBe(
      0,
    );
  });
});
