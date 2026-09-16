import { createHmac } from "node:crypto";
import request from "supertest";
import { Company } from "../src/database/entities/company.entity";
import { CompanyCapability } from "../src/database/entities/company-capability.entity";
import { CompanyWhatsAppConnection } from "../src/database/entities/company-whatsapp-connection.entity";
import type { CapabilityKey } from "../src/common/capabilities/capability";
import { WhatsAppTokenCipher } from "../src/modules/whatsapp/whatsapp-token.cipher";
import { WhatsAppService } from "../src/modules/whatsapp/whatsapp.service";
import { WebhookSignatureAlarm } from "../src/modules/whatsapp/webhook-signature";
import type { IncomingMessage } from "../src/modules/whatsapp/whatsapp.provider";
import { resetSchema } from "./test-db";
import { bootstrapE2E, teardownE2E, type E2EContext } from "./e2e-app";

/**
 * Story 6.1 — o webhook da Cloud API, ponta a ponta.
 *
 * O webhook é chamado **pela Meta**, sem passar por login nenhum, e isso muda as
 * regras. Este arquivo existe para impedir, em ordem de gravidade:
 *
 *  1. **Aceitar requisição que não é da Meta.** A assinatura é a única prova.
 *     Sem ela, qualquer um na internet manda "a cliente quer cancelar".
 *  2. **Responder mal e perder o canal de TODOS.** Evento desconhecido, payload
 *     torto e número sem tenant precisam terminar em **200** — a Meta desativa o
 *     webhook do aplicativo inteiro por qualquer resposta ruim (DL-080).
 *  3. **Atender empresa cortada.** Camada 3 do DL-072: sem `whatsapp_bot`, a
 *     mensagem é descartada e nada é despachado.
 *  4. **Cruzar tenants.** A mensagem do número de um salão nunca pode ser
 *     tratada como de outro, e a resposta sai com o token DAQUELE salão.
 *
 * As credenciais são **por tenant** desde o primeiro dia (DL-073) — não há
 * credencial global no ambiente, e o teste prova isso enviando por duas empresas
 * e conferindo qual token foi para a Graph API.
 */
jest.setTimeout(60000);

const APP_SECRET = "segredo-do-app-da-meta-e2e";
const VERIFY_TOKEN = "verify-token-e2e";
// Chave da cifra do token por tenant (DL-084). Em produção vive só no ambiente.
process.env.WHATSAPP_APP_SECRET = APP_SECRET;
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.WHATSAPP_TOKEN_KEY = "f".repeat(64);
process.env.WHATSAPP_GRAPH_URL = "https://graph.test";

const NUMERO_A = "PN-SALAO-A";
const NUMERO_B = "PN-SALAO-B";
const TOKEN_A = "token-do-salao-A-xxxxxxxxxxxxxxxxxxxx";
const TOKEN_B = "token-do-salao-B-yyyyyyyyyyyyyyyyyyyy";

interface ChamadaGraph {
  url: string;
  authorization: string;
  body: unknown;
}

describe("Webhook do WhatsApp (e2e — Story 6.1)", () => {
  let ctx: E2EContext;
  let empresaA = "";
  let empresaB = "";
  let recebidas: IncomingMessage[] = [];
  let chamadasGraph: ChamadaGraph[] = [];
  const fetchOriginal = global.fetch;

  const api = () => request(ctx.app.getHttpServer());

  function assinar(corpo: unknown, segredo = APP_SECRET): string {
    const cru = JSON.stringify(corpo);
    return `sha256=${createHmac("sha256", segredo).update(cru).digest("hex")}`;
  }

  /**
   * Envia o webhook como a Meta envia: corpo cru + assinatura daquele corpo.
   * `.send(objeto)` do supertest serializa igual ao `JSON.stringify` acima, que
   * é o que faz a assinatura bater — é exatamente por isso que o endpoint lê o
   * corpo CRU e não o JSON reserializado pelo Nest.
   */
  function postWebhook(corpo: unknown, assinatura?: string) {
    return api()
      .post("/api/whatsapp/webhook")
      .set("x-hub-signature-256", assinatura ?? assinar(corpo))
      .set("content-type", "application/json")
      .send(corpo as object);
  }

  function payloadTexto(phoneNumberId: string, texto: string): unknown {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: phoneNumberId },
                contacts: [{ profile: { name: "Ana" }, wa_id: "5511999990000" }],
                messages: [
                  {
                    from: "5511999990000",
                    id: `wamid.${texto}`,
                    timestamp: "1757000000",
                    type: "text",
                    text: { body: texto },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  async function conectar(
    companyId: string,
    phoneNumberId: string,
    token: string,
  ): Promise<void> {
    const cipher = ctx.app.get(WhatsAppTokenCipher);
    const repo = ctx.dataSource.getRepository(CompanyWhatsAppConnection);
    await repo.save(
      repo.create({
        company_id: companyId,
        provider: "cloud_api",
        phone_number_id: phoneNumberId,
        waba_id: "1944290202933684",
        access_token: cipher.encrypt(token),
        status: "conectado",
        connected_at: new Date(),
        connected_by: "e2e",
      }),
    );
  }

  async function conceder(
    companyId: string,
    capability: CapabilityKey,
  ): Promise<void> {
    const repo = ctx.dataSource.getRepository(CompanyCapability);
    await repo.save(
      repo.create({ company_id: companyId, capability, granted_by: "e2e" }),
    );
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
    ctx.app.get(WebhookSignatureAlarm).reset();
    recebidas = [];
    chamadasGraph = [];

    // A Graph API é dublada: o smoke test com a Meta de verdade é manual e está
    // documentado no artefato desta story. Aqui o que se prova é QUAL token vai.
    global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      chamadasGraph.push({
        url: String(url),
        authorization: headers.authorization ?? "",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ messages: [{ id: "wamid.RESPOSTA" }] }),
      } as unknown as Response);
    }) as unknown as typeof fetch;

    await ctx.dataSource.query("DELETE FROM company_whatsapp_connections");
    await ctx.dataSource.query("DELETE FROM company_capabilities");
    await ctx.dataSource.query("DELETE FROM companies");

    const companies = ctx.dataSource.getRepository(Company);
    empresaA = (
      await companies.save(companies.create({ name: "Salão A", slug: "salao-a" }))
    ).id;
    empresaB = (
      await companies.save(companies.create({ name: "Salão B", slug: "salao-b" }))
    ).id;

    await conectar(empresaA, NUMERO_A, TOKEN_A);
    await conectar(empresaB, NUMERO_B, TOKEN_B);
    await conceder(empresaA, "whatsapp_bot");
    await conceder(empresaB, "whatsapp_bot");

    // Handler de prova, no lugar que a máquina de conversa (6.2) vai ocupar.
    ctx.app.get(WhatsAppService).registerIncomingMessageHandler((m) => {
      recebidas.push(m);
    });
  });

  // ─── 1. a assinatura é a única prova ──────────────────────────────────────

  it("assinatura INVÁLIDA é rejeitada e nada é processado", async () => {
    await postWebhook(
      payloadTexto(NUMERO_A, "invasao"),
      assinar(payloadTexto(NUMERO_A, "invasao"), "segredo-errado"),
    ).expect(403);
    expect(recebidas).toHaveLength(0);
  });

  it("requisição SEM assinatura é rejeitada", async () => {
    await api()
      .post("/api/whatsapp/webhook")
      .set("content-type", "application/json")
      .send(payloadTexto(NUMERO_A, "sem-assinatura") as object)
      .expect(403);
    expect(recebidas).toHaveLength(0);
  });

  it("corpo adulterado depois de assinado é rejeitado", async () => {
    // A assinatura é do corpo EXATO. Trocar um caractere invalida — é o que
    // impede repetir um webhook legítimo com o conteúdo alterado.
    const original = payloadTexto(NUMERO_A, "original");
    await postWebhook(payloadTexto(NUMERO_A, "adulterado"), assinar(original)).expect(
      403,
    );
    expect(recebidas).toHaveLength(0);
  });

  it("rejeição em massa SEM nenhuma aceita levanta o ALARME", async () => {
    // Segredo errado depois de uma implantação rejeita TUDO — e a Meta, na
    // insistência, desativa o webhook do aplicativo inteiro (DL-080).
    const alarme = ctx.app.get(WebhookSignatureAlarm);
    for (let i = 0; i < 5; i += 1) {
      await postWebhook(payloadTexto(NUMERO_A, `x${i}`), "sha256=00").expect(403);
    }
    expect(alarme.contagem).toMatchObject({ rejeicoes: 5, aceitas: 0 });
  });

  it("handshake de verificação devolve o challenge em texto puro", async () => {
    const res = await api()
      .get("/api/whatsapp/webhook")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "1234567890",
      })
      .expect(200);
    expect(res.text).toBe("1234567890");
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  it("handshake com verify_token errado é recusado", async () => {
    await api()
      .get("/api/whatsapp/webhook")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "chutado",
        "hub.challenge": "1234567890",
      })
      .expect(403);
  });

  // ─── 2. responder bem, sempre ─────────────────────────────────────────────

  it("assinatura válida responde 200 e despacha a mensagem", async () => {
    await postWebhook(payloadTexto(NUMERO_A, "oi")).expect(200);
    expect(recebidas).toHaveLength(1);
    expect(recebidas[0]).toMatchObject({ companyId: empresaA, text: "oi" });
  });

  it.each([
    [
      "status de entrega",
      {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: NUMERO_A },
                  statuses: [{ id: "wamid.S", status: "delivered", timestamp: "1757000000" }],
                },
              },
            ],
          },
        ],
      },
    ],
    [
      "evento de conta (tipo desconhecido)",
      {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              { field: "message_template_status_update", value: { metadata: {} } },
            ],
          },
        ],
      },
    ],
    ["payload vazio", {}],
    ["payload de outra assinatura", { object: "instagram", entry: [] }],
    [
      "número que não é de nenhum tenant",
      {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: "PN-DE-NINGUEM" },
                  messages: [
                    { from: "55", id: "wamid.Z", type: "text", text: { body: "oi" } },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  ])("%s responde 200 e não derruba nada", async (_nome, payload) => {
    await postWebhook(payload).expect(200);
    expect(recebidas).toHaveLength(0);
  });

  // ─── 3. camada 3 do gate ──────────────────────────────────────────────────

  it("empresa SEM a capability não processa — e a Meta ainda recebe 200", async () => {
    // Responder erro faria a Meta repetir e, na insistência, desativar o
    // webhook — derrubando o canal de TODOS, não só o do cortado (DL-072).
    await ctx.dataSource.query(
      "DELETE FROM company_capabilities WHERE company_id = ?",
      [empresaA],
    );
    await postWebhook(payloadTexto(NUMERO_A, "cortada")).expect(200);
    expect(recebidas).toHaveLength(0);
  });

  it("empresa sem capability não ENVIA, nem pelo caminho sem request", async () => {
    await ctx.dataSource.query(
      "DELETE FROM company_capabilities WHERE company_id = ?",
      [empresaA],
    );
    const whatsapp = ctx.app.get(WhatsAppService);
    await expect(
      whatsapp.sendMessage(empresaA, { to: "5511", text: "oi" }, "whatsapp_bot"),
    ).rejects.toThrow(/não tem o recurso/);
    expect(chamadasGraph).toHaveLength(0);
  });

  it("cortar a capability corta na requisição seguinte, sem reiniciar nada", async () => {
    await postWebhook(payloadTexto(NUMERO_A, "antes")).expect(200);
    await ctx.dataSource.query(
      "DELETE FROM company_capabilities WHERE company_id = ?",
      [empresaA],
    );
    await postWebhook(payloadTexto(NUMERO_A, "depois")).expect(200);
    // Linha fresca a cada decisão, sem cache: o corte vale na hora (6.16).
    expect(recebidas.map((m) => m.text)).toEqual(["antes"]);
  });

  // ─── 4. isolamento entre tenants ──────────────────────────────────────────

  it("cada número entrega para a SUA empresa", async () => {
    await postWebhook(payloadTexto(NUMERO_A, "para-A")).expect(200);
    await postWebhook(payloadTexto(NUMERO_B, "para-B")).expect(200);
    expect(recebidas.map((m) => [m.companyId, m.text])).toEqual([
      [empresaA, "para-A"],
      [empresaB, "para-B"],
    ]);
  });

  it("o envio usa a credencial DO TENANT, nunca uma global", async () => {
    // A prova de que não existe credencial global: dois envios, duas empresas,
    // dois tokens diferentes e dois phone_number_id diferentes na URL.
    const whatsapp = ctx.app.get(WhatsAppService);
    await whatsapp.sendMessage(empresaA, { to: "5511", text: "de A" }, "whatsapp_bot");
    await whatsapp.sendMessage(empresaB, { to: "5511", text: "de B" }, "whatsapp_bot");

    expect(chamadasGraph).toHaveLength(2);
    expect(chamadasGraph[0].url).toContain(`/${NUMERO_A}/messages`);
    expect(chamadasGraph[0].authorization).toBe(`Bearer ${TOKEN_A}`);
    expect(chamadasGraph[1].url).toContain(`/${NUMERO_B}/messages`);
    expect(chamadasGraph[1].authorization).toBe(`Bearer ${TOKEN_B}`);
  });

  it("o ciclo completo: recebe pelo número de A e responde pelo número de A", async () => {
    // É o smoke test em miniatura — mesmo caminho, com a Graph API dublada.
    const whatsapp = ctx.app.get(WhatsAppService);
    whatsapp.registerIncomingMessageHandler(async (m) => {
      recebidas.push(m);
      await whatsapp.sendMessage(
        m.companyId,
        { to: m.from, text: `Eco: ${m.text}` },
        "whatsapp_bot",
      );
    });

    await postWebhook(payloadTexto(NUMERO_A, "ida")).expect(200);

    expect(recebidas).toHaveLength(1);
    expect(chamadasGraph).toHaveLength(1);
    expect(chamadasGraph[0].url).toContain(`/${NUMERO_A}/messages`);
    expect(chamadasGraph[0].authorization).toBe(`Bearer ${TOKEN_A}`);
    expect(chamadasGraph[0].body).toMatchObject({
      to: "5511999990000",
      text: { body: "Eco: ida" },
    });
  });

  it("o token NÃO sai do banco em texto puro", async () => {
    const linhas: { access_token: string }[] = await ctx.dataSource.query(
      "SELECT access_token FROM company_whatsapp_connections",
    );
    for (const linha of linhas) {
      expect(linha.access_token).not.toContain("token-do-salao");
      expect(linha.access_token.startsWith("v1:")).toBe(true);
    }
  });
});
