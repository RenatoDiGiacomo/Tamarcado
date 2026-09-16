import { Logger } from "@nestjs/common";
import {
  classificarErro,
  CloudApiProvider,
  mascararTelefone,
} from "./cloud-api.provider";
import { WhatsAppDeliveryException } from "../whatsapp.errors";
import type { TenantWhatsAppCredentials } from "../whatsapp.provider";

const TOKEN = "EAAsegredo-de-operacao-em-nome-do-cliente-1234567890";

const CREDENCIAIS: TenantWhatsAppCredentials = {
  companyId: "7",
  provider: "cloud_api",
  phoneNumberId: "PN-7",
  wabaId: "1944290202933684",
  accessToken: TOKEN,
};

const CONFIG = {
  baseUrl: "https://graph.test",
  version: "v21.0",
  timeoutMs: 1000,
};

function resposta(status: number, corpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(corpo),
  } as unknown as Response;
}

describe("CloudApiProvider — envio (AC-4)", () => {
  let chamadas: { url: string; init: RequestInit }[];

  beforeEach(() => {
    chamadas = [];
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  function comFetch(devolve: () => Response | Promise<Response>): CloudApiProvider {
    global.fetch = jest.fn((url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), init: init ?? {} });
      return Promise.resolve(devolve());
    }) as unknown as typeof fetch;
    return new CloudApiProvider(CREDENCIAIS, CONFIG);
  }

  it("envia pelo phone_number_id DO TENANT, com o token DELE", async () => {
    const provider = comFetch(() =>
      resposta(200, { messages: [{ id: "wamid.OK" }] }),
    );
    const r = await provider.sendMessage({ to: "5511999990000", text: "olá" });

    expect(r).toEqual({ providerMessageId: "wamid.OK" });
    expect(chamadas[0].url).toBe("https://graph.test/v21.0/PN-7/messages");
    const headers = chamadas[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(chamadas[0].init.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "5511999990000",
      text: { body: "olá", preview_url: false },
    });
  });

  it("falha permanente lança WhatsAppDeliveryException", async () => {
    const provider = comFetch(() =>
      resposta(400, { error: { code: 131026, message: "not on WhatsApp" } }),
    );
    await expect(
      provider.sendMessage({ to: "5511", text: "oi" }),
    ).rejects.toBeInstanceOf(WhatsAppDeliveryException);
  });

  it("rede fora é falha TEMPORÁRIA, não permanente", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new Error("fetch failed")),
    ) as unknown as typeof fetch;
    const provider = new CloudApiProvider(CREDENCIAIS, CONFIG);
    await expect(
      provider.sendMessage({ to: "5511", text: "oi" }),
    ).rejects.toMatchObject({ permanente: false });
  });

  it("200 sem identificador de mensagem é tratado como falha", async () => {
    // Inventar um id faria a 6.20 usar como chave de unicidade algo que ninguém
    // escolheu.
    const provider = comFetch(() => resposta(200, { messages: [] }));
    await expect(
      provider.sendMessage({ to: "5511", text: "oi" }),
    ).rejects.toBeInstanceOf(WhatsAppDeliveryException);
  });

  it("estado da conexão NÃO lança quando a Meta recusa — informa", async () => {
    const provider = comFetch(() => resposta(401, { error: { code: 190 } }));
    await expect(provider.getConnectionStatus()).resolves.toMatchObject({
      conectado: false,
      motivo: expect.stringContaining("token da conexão inválido"),
    });
  });

  it("estado da conexão traz número, nome e qualidade", async () => {
    const provider = comFetch(() =>
      resposta(200, {
        display_phone_number: "+55 11 94245-8672",
        verified_name: "TaMarcado",
        quality_rating: "GREEN",
      }),
    );
    await expect(provider.getConnectionStatus()).resolves.toEqual({
      provider: "cloud_api",
      conectado: true,
      displayPhoneNumber: "+55 11 94245-8672",
      nomeExibicao: "TaMarcado",
      qualidade: "GREEN",
    });
  });
});

describe("CloudApiProvider — o token NUNCA vaza", () => {
  let log: jest.SpyInstance;
  let erro: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    erro = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  function tudoQueFoiRegistrado(): string {
    return [...log.mock.calls, ...erro.mock.calls].flat().join(" | ");
  }

  it("não aparece no log do envio bem-sucedido", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(resposta(200, { messages: [{ id: "wamid.OK" }] })),
    ) as unknown as typeof fetch;
    await new CloudApiProvider(CREDENCIAIS, CONFIG).sendMessage({
      to: "5511999990000",
      text: "oi",
    });
    const registrado = tudoQueFoiRegistrado();
    expect(registrado).not.toContain(TOKEN);
    expect(registrado).not.toContain(TOKEN.slice(0, 10));
    // Nem o telefone da cliente inteiro: o dado é dela, e os últimos dígitos já
    // resolvem o suporte (somos OPERADOR — DL-080).
    expect(registrado).not.toContain("5511999990000");
  });

  it("não aparece no log NEM na exceção quando a Meta recusa por token inválido", async () => {
    // É o caso mais perigoso: o erro *é* sobre o token, e a tentação de
    // registrá-lo "só para conferir" é máxima.
    global.fetch = jest.fn(() =>
      Promise.resolve(
        resposta(401, {
          error: {
            code: 190,
            message: `Invalid OAuth access token: ${TOKEN}`,
            type: "OAuthException",
          },
        }),
      ),
    ) as unknown as typeof fetch;

    let lancado: Error | undefined;
    try {
      await new CloudApiProvider(CREDENCIAIS, CONFIG).sendMessage({
        to: "5511",
        text: "oi",
      });
    } catch (e) {
      lancado = e as Error;
    }
    expect(lancado).toBeInstanceOf(WhatsAppDeliveryException);
    // A Meta ecoou o token no corpo do erro. Copiá-lo para o log seria vazá-lo.
    expect(lancado?.message).not.toContain(TOKEN);
    expect(tudoQueFoiRegistrado()).not.toContain(TOKEN);
  });
});

describe("mascararTelefone", () => {
  it("guarda só os últimos quatro dígitos", () => {
    expect(mascararTelefone("5511999990000")).toBe("*********0000");
  });
  it("número curto demais some por inteiro", () => {
    expect(mascararTelefone("123")).toBe("****");
  });
});

describe("classificarErro — motivo curto, sem eco do corpo", () => {
  it.each([
    [401, { error: { code: 190 } }, /token da conexão inválido/, true],
    [400, { error: { code: 131030 } }, /lista permitida/, true],
    [400, { error: { code: 131047 } }, /janela de 24h/, true],
    [400, { error: { code: 131026 } }, /não tem WhatsApp/, true],
    [429, {}, /limite de chamadas/, false],
    [503, {}, /respondeu 503/, false],
    [403, {}, /não tem permissão/, true],
  ])("HTTP %s classifica certo", (status, corpo, esperado, permanente) => {
    const r = classificarErro(status as number, corpo as Record<string, unknown>);
    expect(r.motivo).toMatch(esperado as RegExp);
    expect(r.permanente).toBe(permanente);
  });

  it("erro desconhecido não copia a mensagem da Meta", () => {
    const r = classificarErro(418, {
      error: { code: 999, message: "algo com um segredo dentro" },
    });
    expect(r.motivo).not.toContain("segredo");
    expect(r.motivo).toContain("418");
  });
});
