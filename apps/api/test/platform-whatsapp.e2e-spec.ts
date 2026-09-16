import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { CompanyWhatsAppConnection } from "../src/database/entities/company-whatsapp-connection.entity";
import { PlatformRateLimitService } from "../src/modules/platform/platform-rate-limit.service";
import { WhatsAppTokenCipher } from "../src/modules/whatsapp/whatsapp-token.cipher";
import { WhatsAppConnectionService } from "../src/modules/whatsapp/whatsapp-connection.service";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 6.1 — as credenciais por tenant preenchidas **à mão** (DL-073).
 *
 * Enquanto o Embedded Signup (6.12) está bloqueado pelo CNPJ inapto, é por aqui
 * que um estabelecimento ganha WhatsApp. O que este arquivo impede:
 *
 *  1. **Token voltando numa resposta.** Nem inteiro, nem truncado, em nenhuma
 *     das três rotas. É a regra que, uma vez quebrada, vaza para print de tela e
 *     para log de proxy sem ninguém perceber.
 *  2. **Credencial global.** Cada empresa tem a sua; conectar uma não conecta a
 *     outra, e o mesmo número não pode pertencer a duas.
 *  3. **Desconectar destruindo o vínculo.** Desligar apaga o SEGREDO e mantém o
 *     registro (DL-082 — refazer a conexão com a Meta é a parte cara para o dono).
 *  4. **Endpoint aberto.** Sem `x-platform-key`, nada.
 */
jest.setTimeout(60000);

const PLATFORM_KEY = "test-platform-key-6161";
process.env.PLATFORM_KEY = PLATFORM_KEY;
process.env.WHATSAPP_TOKEN_KEY = "f".repeat(64);
process.env.WHATSAPP_GRAPH_URL = "https://graph.test";

const TOKEN = "EAAtoken-de-operacao-do-salao-1234567890";

describe("Conexão de WhatsApp pelo endpoint de plataforma (e2e — Story 6.1)", () => {
  let ctx: E2EContext;
  let companyId = "";
  const fetchOriginal = global.fetch;

  const api = () => request(ctx.app.getHttpServer());

  const rota = (slug = "salao-a") => `/api/platform/companies/${slug}/whatsapp`;

  function corpo(extra: Record<string, unknown> = {}) {
    return {
      provider: "cloud_api",
      phoneNumberId: "PN-SALAO-A",
      wabaId: "1944290202933684",
      displayPhoneNumber: "+55 11 94245-8672",
      accessToken: TOKEN,
      ...extra,
    };
  }

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    await resetSchema(ctx.dataSource);
  });

  afterAll(async () => {
    global.fetch = fetchOriginal;
    await teardownE2E(ctx);
  });

  beforeEach(async () => {
    ctx.app.get(PlatformRateLimitService).reset();
    // A conferência ao vivo fala com a Graph API; aqui ela é dublada.
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            display_phone_number: "+55 11 94245-8672",
            verified_name: "TaMarcado",
            quality_rating: "GREEN",
          }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    await ctx.dataSource.query("DELETE FROM company_whatsapp_connections");
    await ctx.dataSource.query("DELETE FROM companies");
    const companies = ctx.dataSource.getRepository(Company);
    companyId = (
      await companies.save(companies.create({ name: "Salão A", slug: "salao-a" }))
    ).id;
    await companies.save(companies.create({ name: "Salão B", slug: "salao-b" }));
  });

  it("sem x-platform-key, nada", async () => {
    await api().put(rota()).send(corpo()).expect(401);
    await api().get(rota()).expect(401);
    await api().delete(rota()).expect(401);
  });

  it("conecta e devolve o estado — SEM o token", async () => {
    const res = await api()
      .put(rota())
      .set("x-platform-key", PLATFORM_KEY)
      .send(corpo())
      .expect(200);

    const texto = JSON.stringify(res.body);
    // A regra que não pode ser quebrada: o token entra e nunca mais sai.
    expect(texto).not.toContain(TOKEN);
    expect(texto).not.toContain(TOKEN.slice(0, 10));
    expect(res.body).toMatchObject({
      slug: "salao-a",
      conexao: {
        provider: "cloud_api",
        phoneNumberId: "PN-SALAO-A",
        displayPhoneNumber: "+55 11 94245-8672",
        status: "conectado",
        connectedBy: "manual:plataforma",
      },
      estado: { conectado: true, qualidade: "GREEN" },
    });
  });

  it("a conferência ao vivo responde 'preenchi certo?' sem desfazer a gravação", async () => {
    // Credencial gravada e provider fora do ar são problemas diferentes;
    // desfazer a gravação obrigaria a digitar o token de novo.
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: 190 } }),
      } as unknown as Response),
    ) as unknown as typeof fetch;

    const res = await api()
      .put(rota())
      .set("x-platform-key", PLATFORM_KEY)
      .send(corpo())
      .expect(200);

    expect(res.body.conexao).toMatchObject({ status: "conectado" });
    expect(res.body.estado).toMatchObject({
      conectado: false,
      motivo: expect.stringContaining("token da conexão inválido"),
    });
  });

  it("o GET também nunca devolve o token", async () => {
    await api().put(rota()).set("x-platform-key", PLATFORM_KEY).send(corpo()).expect(200);
    const res = await api().get(rota()).set("x-platform-key", PLATFORM_KEY).expect(200);
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    expect(res.body.conexao.phoneNumberId).toBe("PN-SALAO-A");
  });

  it("empresa inexistente é 404", async () => {
    await api()
      .put(rota("nao-existe"))
      .set("x-platform-key", PLATFORM_KEY)
      .send(corpo())
      .expect(404);
  });

  it("ISOLAMENTO: conectar uma empresa não conecta a outra", async () => {
    await api().put(rota("salao-a")).set("x-platform-key", PLATFORM_KEY).send(corpo()).expect(200);
    const res = await api()
      .get(rota("salao-b"))
      .set("x-platform-key", PLATFORM_KEY)
      .expect(200);
    expect(res.body.conexao).toBeNull();
    expect(res.body.estado).toBeNull();
  });

  it("o MESMO número não pode pertencer a duas empresas", async () => {
    // A unicidade global de `phone_number_id` é o que torna o roteamento do
    // webhook determinístico — sem ela, duas empresas reivindicariam o evento.
    await api().put(rota("salao-a")).set("x-platform-key", PLATFORM_KEY).send(corpo()).expect(200);
    const res = await api()
      .put(rota("salao-b"))
      .set("x-platform-key", PLATFORM_KEY)
      .send(corpo())
      .expect(409);
    // 409 com explicação, não 500 com erro de banco: quem está do outro lado é
    // o operador preenchendo à mão, e ele precisa saber que o número tem dono.
    expect((res.body as { message: string }).message).toContain(
      "já está vinculado a outro estabelecimento",
    );
  });

  it("regravar troca o token e não cria uma segunda conexão", async () => {
    await api().put(rota()).set("x-platform-key", PLATFORM_KEY).send(corpo()).expect(200);
    await api()
      .put(rota())
      .set("x-platform-key", PLATFORM_KEY)
      .send(corpo({ accessToken: "EAAtoken-novo-depois-de-expirar" }))
      .expect(200);

    const repo = ctx.dataSource.getRepository(CompanyWhatsAppConnection);
    const linhas = await repo.find({ where: { company_id: companyId } });
    expect(linhas).toHaveLength(1);
    const cipher = ctx.app.get(WhatsAppTokenCipher);
    expect(cipher.decrypt(linhas[0].access_token as string)).toBe(
      "EAAtoken-novo-depois-de-expirar",
    );
  });

  it("desconectar apaga o SEGREDO e mantém o vínculo (DL-082)", async () => {
    await api().put(rota()).set("x-platform-key", PLATFORM_KEY).send(corpo()).expect(200);
    const res = await api().delete(rota()).set("x-platform-key", PLATFORM_KEY).expect(200);

    expect(res.body.conexao).toMatchObject({
      status: "desconectado",
      phoneNumberId: "PN-SALAO-A",
    });

    const repo = ctx.dataSource.getRepository(CompanyWhatsAppConnection);
    const linha = await repo.findOne({ where: { company_id: companyId } });
    expect(linha?.access_token).toBeNull();

    // E, desconectada, ela não fornece credencial para ninguém enviar.
    await expect(
      ctx.app.get(WhatsAppConnectionService).credenciais(companyId),
    ).resolves.toBeNull();
  });

  it("corpo com campo errado não passa em silêncio", async () => {
    // `whitelist: true` descarta chave desconhecida sem avisar; o obrigatório
    // ausente é o que transforma o typo em 400 ruidoso em vez de conexão torta.
    await api()
      .put(rota())
      .set("x-platform-key", PLATFORM_KEY)
      .send({ ...corpo(), phoneNumberId: undefined, phone_number_id: "PN-X" })
      .expect(400);
  });

  it("provider que não vendemos é recusado na entrada", async () => {
    await api()
      .put(rota())
      .set("x-platform-key", PLATFORM_KEY)
      .send(corpo({ provider: "whatsapp_web" }))
      .expect(400);
  });
});
