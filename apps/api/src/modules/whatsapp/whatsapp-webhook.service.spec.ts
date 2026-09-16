import { Logger } from "@nestjs/common";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import type { WhatsAppConnectionService } from "./whatsapp-connection.service";
import type { CapabilitiesService } from "../capabilities/capabilities.service";
import type { WhatsAppService } from "./whatsapp.service";
import type { CapabilityKey } from "../../common/capabilities/capability";
import type { IncomingMessage } from "./whatsapp.provider";

const NUMERO_A = "PN-A";
const NUMERO_B = "PN-B";

function payloadComTexto(phoneNumberId: string, texto = "oi"): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneNumberId },
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

function montar(opcoes: {
  numeros?: Record<string, string>;
  direitos?: Record<string, CapabilityKey[]>;
  aoDespachar?: (m: IncomingMessage) => Promise<void> | void;
}) {
  const recebidas: IncomingMessage[] = [];
  const connections = {
    empresaDoNumero: (phoneNumberId: string) =>
      Promise.resolve(opcoes.numeros?.[phoneNumberId] ?? null),
  } as unknown as WhatsAppConnectionService;

  const capabilities = {
    hasCapability: (companyId: string, key: CapabilityKey) =>
      Promise.resolve((opcoes.direitos?.[companyId] ?? []).includes(key)),
  } as unknown as CapabilitiesService;

  const whatsapp = {
    dispatchIncoming: async (m: IncomingMessage) => {
      recebidas.push(m);
      await opcoes.aoDespachar?.(m);
    },
  } as unknown as WhatsAppService;

  return {
    service: new WhatsAppWebhookService(connections, capabilities, whatsapp),
    recebidas,
  };
}

describe("WhatsAppWebhookService (Story 6.1)", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("resolve o tenant pelo identificador do número e dispara o handler (AC-3)", async () => {
    const { service, recebidas } = montar({
      numeros: { [NUMERO_A]: "10" },
      direitos: { "10": ["whatsapp_bot"] },
    });
    const resultado = await service.processar(payloadComTexto(NUMERO_A));
    expect(resultado).toMatchObject({ recebidos: 1, mensagens: 1, falhas: 0 });
    expect(recebidas[0]).toMatchObject({
      companyId: "10",
      text: "oi",
      from: "5511999990000",
    });
  });

  it("ISOLAMENTO: cada número entrega para a SUA empresa", async () => {
    // Se o roteamento errasse, a mensagem da cliente de um salão entraria na
    // conversa de outro — e a resposta sairia pelo número errado.
    const { service, recebidas } = montar({
      numeros: { [NUMERO_A]: "10", [NUMERO_B]: "20" },
      direitos: { "10": ["whatsapp_bot"], "20": ["whatsapp_bot"] },
    });
    await service.processar(payloadComTexto(NUMERO_A, "para-A"));
    await service.processar(payloadComTexto(NUMERO_B, "para-B"));
    expect(recebidas.map((m) => [m.companyId, m.text])).toEqual([
      ["10", "para-A"],
      ["20", "para-B"],
    ]);
  });

  it("CAMADA 3: empresa sem `whatsapp_bot` tem a mensagem DESCARTADA", async () => {
    const { service, recebidas } = montar({
      numeros: { [NUMERO_A]: "10" },
      direitos: { "10": [] },
    });
    const resultado = await service.processar(payloadComTexto(NUMERO_A));
    expect(resultado).toMatchObject({ mensagens: 0, ignorados: 1, falhas: 0 });
    expect(recebidas).toHaveLength(0);
  });

  it("ter `lembrete_automatico` NÃO libera o bot", async () => {
    const { service, recebidas } = montar({
      numeros: { [NUMERO_A]: "10" },
      direitos: { "10": ["lembrete_automatico"] },
    });
    await service.processar(payloadComTexto(NUMERO_A));
    expect(recebidas).toHaveLength(0);
  });

  it("número que não é de nenhum tenant vira 'não roteado', nunca erro", async () => {
    // Acontece de verdade: número que saiu da plataforma, aplicativo de teste
    // apontado para cá, evento atrasado.
    const { service } = montar({ numeros: {} });
    const resultado = await service.processar(payloadComTexto("PN-QUE-NAO-EXISTE"));
    expect(resultado).toMatchObject({ naoRoteados: 1, falhas: 0 });
  });

  it("status de entrega não vira mensagem e não quebra nada", async () => {
    const { service, recebidas } = montar({
      numeros: { [NUMERO_A]: "10" },
      direitos: { "10": ["whatsapp_bot"] },
    });
    const resultado = await service.processar({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: NUMERO_A },
                statuses: [{ id: "wamid.X", status: "delivered", timestamp: "1757000000" }],
              },
            },
          ],
        },
      ],
    });
    expect(resultado).toMatchObject({ status: 1, desconhecidos: 0, mensagens: 0, falhas: 0 });
    expect(recebidas).toHaveLength(0);
  });

  it.each([
    ["payload nulo", null],
    ["payload string", "???"],
    ["evento de conta", {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "account_update", value: { metadata: {} } }] }],
    }],
  ])("evento desconhecido (%s) NÃO derruba nada", async (_nome, payload) => {
    const { service } = montar({ numeros: { [NUMERO_A]: "10" } });
    await expect(service.processar(payload)).resolves.toMatchObject({ falhas: 0 });
  });

  it("uma mensagem que explode NÃO leva as outras do lote junto", async () => {
    // Um POST traz vários eventos. Sem isolamento, a primeira mensagem
    // problemática de um lote de dez engole as outras nove.
    const { service, recebidas } = montar({
      numeros: { [NUMERO_A]: "10" },
      direitos: { "10": ["whatsapp_bot"] },
      aoDespachar: (m) => {
        if (m.text === "explode") {
          throw new Error("erro no tratamento");
        }
      },
    });
    const resultado = await service.processar({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: NUMERO_A },
                messages: [
                  { from: "55", id: "w1", type: "text", text: { body: "explode" } },
                  { from: "55", id: "w2", type: "text", text: { body: "sobrevive" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(resultado).toMatchObject({ recebidos: 2, falhas: 1 });
    expect(recebidas.map((m) => m.text)).toEqual(["explode", "sobrevive"]);
  });

  it("NUNCA lança, nem com o banco fora do ar", async () => {
    // Exceção que suba daqui vira resposta ruim à Meta — que desativa o webhook
    // do aplicativo inteiro, derrubando TODOS os tenants (DL-080).
    const connections = {
      empresaDoNumero: () => Promise.reject(new Error("ECONNREFUSED")),
    } as unknown as WhatsAppConnectionService;
    const service = new WhatsAppWebhookService(
      connections,
      { hasCapability: () => Promise.resolve(true) } as unknown as CapabilitiesService,
      { dispatchIncoming: () => Promise.resolve() } as unknown as WhatsAppService,
    );
    await expect(service.processar(payloadComTexto(NUMERO_A))).resolves.toMatchObject(
      { falhas: 1 },
    );
  });
});
