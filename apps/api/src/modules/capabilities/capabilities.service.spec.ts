import { Repository } from "typeorm";
import { CompanyCapability } from "../../database/entities/company-capability.entity";
import type { CapabilityKey } from "../../common/capabilities/capability";
import { CapabilitiesService } from "./capabilities.service";

/**
 * `setForCompany` — o método que REBAIXA (Story 6.16).
 *
 * Testado em unit porque o que precisa estar certo aqui é o DIFF: o que é
 * revogado, o que é concedido, e — principalmente — o que NÃO é tocado. Quem
 * já tinha o direito não pode ter a linha reescrita, senão `granted_at` deixa
 * de responder "desde quando ele tem isso" e vira "quando o operador mexeu pela
 * última vez".
 *
 * O efeito ponta a ponta (403 na hora, corte fora de requisição, credencial
 * preservada) é provado em `test/platform-plan.e2e-spec.ts`.
 */
describe("CapabilitiesService.setForCompany (Story 6.16)", () => {
  const COMPANY = "42";
  let atuais: CapabilityKey[];
  let revogadas: CapabilityKey[][];
  let concedidas: { keys: readonly CapabilityKey[]; by: string }[];
  let service: CapabilitiesService;

  beforeEach(() => {
    atuais = [];
    revogadas = [];
    concedidas = [];

    // Repositório falso: `listForCompany` lê `atuais`, e grant/revoke são
    // espionados pelo próprio service (métodos públicos já cobertos pela 6.11).
    service = new CapabilitiesService({} as Repository<CompanyCapability>);
    jest
      .spyOn(service, "listForCompany")
      .mockImplementation(async () => [...atuais]);
    jest
      .spyOn(service, "revoke")
      .mockImplementation(async (_company, keys) => {
        revogadas.push([...keys]);
        atuais = atuais.filter((k) => !keys.includes(k));
      });
    jest
      .spyOn(service, "grant")
      .mockImplementation(async (_company, keys, by) => {
        concedidas.push({ keys: [...keys], by });
        atuais = [...atuais, ...keys.filter((k) => !atuais.includes(k))];
      });
  });

  it("SUBIR concede só o que falta e não revoga nada", async () => {
    atuais = ["whatsapp_bot"];

    const { before, after } = await service.setForCompany(
      COMPANY,
      ["whatsapp_bot", "lembrete_automatico"],
      "renato",
    );

    expect(before).toEqual(["whatsapp_bot"]);
    expect(after).toEqual(["whatsapp_bot", "lembrete_automatico"]);
    expect(concedidas).toEqual([
      { keys: ["lembrete_automatico"], by: "renato" },
    ]);
    // Quem já tinha o direito não é tocado — `granted_at` preservado.
    expect(revogadas).toEqual([[]]);
  });

  it("DESCER revoga o que sobra — é o caminho que a story existe para abrir", async () => {
    atuais = ["whatsapp_bot", "lembrete_automatico"];

    const { before, after } = await service.setForCompany(COMPANY, [], "renato");

    expect(before).toEqual(["whatsapp_bot", "lembrete_automatico"]);
    expect(after).toEqual([]);
    expect(revogadas).toEqual([["whatsapp_bot", "lembrete_automatico"]]);
    expect(concedidas).toEqual([{ keys: [], by: "renato" }]);
  });

  it("troca lateral revoga um e concede outro na mesma chamada", async () => {
    atuais = ["whatsapp_bot"];

    await service.setForCompany(COMPANY, ["lembrete_automatico"], "renato");

    expect(revogadas).toEqual([["whatsapp_bot"]]);
    expect(concedidas).toEqual([
      { keys: ["lembrete_automatico"], by: "renato" },
    ]);
  });

  it("aplicar o mesmo estado de novo não mexe em nada", async () => {
    atuais = ["whatsapp_bot"];

    await service.setForCompany(COMPANY, ["whatsapp_bot"], "renato");

    expect(revogadas).toEqual([[]]);
    expect(concedidas).toEqual([{ keys: [], by: "renato" }]);
  });

  it("chave repetida na entrada é desduplicada (erro de digitação do operador)", async () => {
    await service.setForCompany(
      COMPANY,
      ["whatsapp_bot", "whatsapp_bot"],
      "renato",
    );

    expect(concedidas).toEqual([{ keys: ["whatsapp_bot"], by: "renato" }]);
  });
});
