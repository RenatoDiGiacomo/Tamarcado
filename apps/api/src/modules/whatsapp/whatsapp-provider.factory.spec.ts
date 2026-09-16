import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { WhatsAppProviderFactory } from "./whatsapp-provider.factory";
import type { WhatsAppConnectionService } from "./whatsapp-connection.service";
import type { TenantWhatsAppCredentials } from "./whatsapp.provider";
import {
  WhatsAppConfigException,
  WhatsAppNotConnectedException,
} from "./whatsapp.errors";
import { CloudApiProvider } from "./providers/cloud-api.provider";
import { EvolutionApiProvider } from "./providers/evolution-api.provider";

const config = {
  get: <T>(_nome: string, padrao?: T) => padrao,
} as unknown as ConfigService;

function credenciais(
  parcial: Partial<TenantWhatsAppCredentials> = {},
): TenantWhatsAppCredentials {
  return {
    companyId: "1",
    provider: "cloud_api",
    phoneNumberId: "PN-1",
    wabaId: "WABA-1",
    accessToken: "token-da-empresa-1",
    ...parcial,
  };
}

function connectionsCom(
  porEmpresa: Record<string, TenantWhatsAppCredentials | null>,
): WhatsAppConnectionService {
  return {
    credenciais: (companyId: string) =>
      Promise.resolve(porEmpresa[companyId] ?? null),
  } as unknown as WhatsAppConnectionService;
}

describe("WhatsAppProviderFactory (Story 6.1, AC-1)", () => {
  const nodeEnvOriginal = process.env.NODE_ENV;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = nodeEnvOriginal;
    jest.restoreAllMocks();
  });

  it("instancia a Cloud API oficial para o tenant", async () => {
    const factory = new WhatsAppProviderFactory(
      connectionsCom({ "1": credenciais() }),
      config,
    );
    const provider = await factory.forCompany("1");
    expect(provider).toBeInstanceOf(CloudApiProvider);
    expect(provider.name).toBe("cloud_api");
    expect(provider.companyId).toBe("1");
  });

  it("empresa sem conexão utilizável não vira provider", async () => {
    const factory = new WhatsAppProviderFactory(connectionsCom({}), config);
    await expect(factory.forCompany("9")).rejects.toBeInstanceOf(
      WhatsAppNotConnectedException,
    );
    await expect(factory.tryForCompany("9")).resolves.toBeNull();
  });

  it("ISOLAMENTO: cada empresa recebe o provider com a credencial DELA", async () => {
    // A credencial entra na CONSTRUÇÃO do provider. Não existe caminho para
    // enviar pela empresa A com o token da B — é garantia de construção, não de
    // revisão de código.
    const factory = new WhatsAppProviderFactory(
      connectionsCom({
        "1": credenciais({ companyId: "1", phoneNumberId: "PN-1" }),
        "2": credenciais({ companyId: "2", phoneNumberId: "PN-2" }),
      }),
      config,
    );
    const um = await factory.forCompany("1");
    const dois = await factory.forCompany("2");
    expect(um.companyId).toBe("1");
    expect(dois.companyId).toBe("2");
    expect(um).not.toBe(dois);
  });

  describe("provider não oficial (DL-054)", () => {
    it("é selecionável em desenvolvimento", async () => {
      process.env.NODE_ENV = "development";
      const factory = new WhatsAppProviderFactory(
        connectionsCom({ "1": credenciais({ provider: "evolution_api" }) }),
        config,
      );
      await expect(factory.forCompany("1")).resolves.toBeInstanceOf(
        EvolutionApiProvider,
      );
    });

    it("é RECUSADO em produção", async () => {
      process.env.NODE_ENV = "production";
      const factory = new WhatsAppProviderFactory(
        connectionsCom({ "1": credenciais({ provider: "evolution_api" }) }),
        config,
      );
      await expect(factory.forCompany("1")).rejects.toThrow(
        WhatsAppConfigException,
      );
    });

    it("é RECUSADO com NODE_ENV ausente — fail-closed", async () => {
      // Mesma postura do CORS: VPS que suba sem a variável NÃO cai no modo
      // permissivo. Aqui o preço do engano é o número do CLIENTE banido.
      delete process.env.NODE_ENV;
      expect(WhatsAppProviderFactory.selecionavel("evolution_api")).toBe(false);
      expect(WhatsAppProviderFactory.selecionavel("cloud_api")).toBe(true);
    });

    it("a Cloud API oficial é selecionável em QUALQUER ambiente", () => {
      process.env.NODE_ENV = "production";
      expect(WhatsAppProviderFactory.selecionavel("cloud_api")).toBe(true);
    });
  });

  it("provider desconhecido no banco não vira fallback silencioso", async () => {
    const factory = new WhatsAppProviderFactory(
      connectionsCom({
        "1": credenciais({
          provider: "whatsapp_web" as unknown as "cloud_api",
        }),
      }),
      config,
    );
    // Sem saber com quem falar, não fala. "Tenta o padrão" mandaria a mensagem
    // por um canal que ninguém escolheu.
    await expect(factory.forCompany("1")).rejects.toThrow(WhatsAppConfigException);
  });
});
