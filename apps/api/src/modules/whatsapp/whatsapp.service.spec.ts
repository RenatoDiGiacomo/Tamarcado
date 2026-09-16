import { Logger } from "@nestjs/common";
import { WhatsAppService } from "./whatsapp.service";
import type { WhatsAppProviderFactory } from "./whatsapp-provider.factory";
import type { CapabilitiesService } from "../capabilities/capabilities.service";
import type { CapabilityKey } from "../../common/capabilities/capability";
import type { IncomingMessage, WhatsAppProvider } from "./whatsapp.provider";
import { WhatsAppCapabilityMissingException } from "./whatsapp.errors";

function providerFalso(companyId: string) {
  const enviadas: { to: string; text: string }[] = [];
  const provider = {
    name: "cloud_api" as const,
    companyId,
    sendMessage: (m: { to: string; text: string }) => {
      enviadas.push(m);
      return Promise.resolve({ providerMessageId: `wamid.${companyId}` });
    },
    getConnectionStatus: () =>
      Promise.resolve({ provider: "cloud_api" as const, conectado: true }),
  } satisfies WhatsAppProvider;
  return { provider, enviadas };
}

function montar(direitos: Record<string, CapabilityKey[]>) {
  const providers = new Map<string, ReturnType<typeof providerFalso>>();
  const factory = {
    forCompany: (companyId: string) => {
      if (!providers.has(companyId)) {
        providers.set(companyId, providerFalso(companyId));
      }
      return Promise.resolve(providers.get(companyId)!.provider);
    },
  } as unknown as WhatsAppProviderFactory;

  const capabilities = {
    hasCapability: (companyId: string, key: CapabilityKey) =>
      Promise.resolve((direitos[companyId] ?? []).includes(key)),
  } as unknown as CapabilitiesService;

  return { service: new WhatsAppService(factory, capabilities), providers };
}

function mensagem(parcial: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    companyId: "1",
    providerMessageId: "wamid.AAA",
    from: "5511999990000",
    tipo: "text",
    text: "oi",
    timestamp: new Date(),
    ...parcial,
  };
}

describe("WhatsAppService — gate de envio (camada 3 do DL-072)", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("empresa COM o direito envia", async () => {
    const { service, providers } = montar({ "1": ["whatsapp_bot"] });
    await service.sendMessage("1", { to: "5511", text: "oi" }, "whatsapp_bot");
    expect(providers.get("1")?.enviadas).toEqual([{ to: "5511", text: "oi" }]);
  });

  it("empresa SEM o direito NÃO envia — e nem chega no provider", async () => {
    // Este caminho não passa por requisição de usuário: quem chama é o webhook
    // (chamado pela Meta) ou o agendador. Nenhum guard roda aqui.
    const { service, providers } = montar({ "1": [] });
    await expect(
      service.sendMessage("1", { to: "5511", text: "oi" }, "whatsapp_bot"),
    ).rejects.toBeInstanceOf(WhatsAppCapabilityMissingException);
    expect(providers.has("1")).toBe(false);
  });

  it("o direito é POR CAPABILITY, não por 'tem WhatsApp'", async () => {
    // `whatsapp_bot` e `lembrete_automatico` se vendem sozinhas (DL-072). Quem
    // comprou só o bot não pode ter lembrete saindo cobrado no cartão dele.
    const { service } = montar({ "1": ["whatsapp_bot"] });
    await expect(
      service.sendMessage("1", { to: "5511", text: "oi" }, "lembrete_automatico"),
    ).rejects.toBeInstanceOf(WhatsAppCapabilityMissingException);
  });

  it("ISOLAMENTO: o direito de uma empresa não libera a outra", async () => {
    const { service, providers } = montar({
      "1": ["whatsapp_bot"],
      "2": [],
    });
    await service.sendMessage("1", { to: "5511", text: "oi" }, "whatsapp_bot");
    await expect(
      service.sendMessage("2", { to: "5511", text: "oi" }, "whatsapp_bot"),
    ).rejects.toBeInstanceOf(WhatsAppCapabilityMissingException);
    expect(providers.get("1")?.enviadas).toHaveLength(1);
    expect(providers.has("2")).toBe(false);
  });

  it("estado da conexão NÃO é gateado — conectar não é usar (DL-082)", async () => {
    // Quem pergunta o estado está tentando entender por que algo não funciona,
    // inclusive numa empresa que ainda não comprou ou que foi cortada.
    const { service } = montar({ "1": [] });
    await expect(service.connectionStatus("1")).resolves.toMatchObject({
      conectado: true,
    });
  });
});

describe("WhatsAppService — handler de mensagem recebida (AC-1)", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("entrega a mensagem a quem se registrou", async () => {
    const { service } = montar({});
    const recebidas: IncomingMessage[] = [];
    service.registerIncomingMessageHandler((m) => {
      recebidas.push(m);
    });
    await service.dispatchIncoming(mensagem());
    expect(recebidas).toHaveLength(1);
    expect(service.temHandler).toBe(true);
  });

  it("sem handler registrado, apenas registra e segue", async () => {
    // Acontece de verdade entre o deploy da 6.1 e o da 6.2 — não é erro.
    const { service } = montar({});
    await expect(service.dispatchIncoming(mensagem())).resolves.toBeUndefined();
  });

  it("substituir o handler AVISA alto", async () => {
    const avisos = jest.spyOn(Logger.prototype, "warn");
    const { service } = montar({});
    service.registerIncomingMessageHandler(() => undefined);
    service.registerIncomingMessageHandler(() => undefined);
    expect(avisos.mock.calls.flat().join(" ")).toContain("SUBSTITUÍDO");
  });
});
