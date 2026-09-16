import { createHmac } from "node:crypto";
import { Logger } from "@nestjs/common";
import { assinaturaValida, WebhookSignatureAlarm } from "./webhook-signature";

const SEGREDO = "app-secret-da-meta";
const CORPO = Buffer.from(JSON.stringify({ object: "whatsapp_business_account" }));

function assinar(corpo: Buffer, segredo = SEGREDO): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

describe("assinaturaValida — a única prova de que veio da Meta (DL-080)", () => {
  it("aceita a assinatura correta", () => {
    expect(assinaturaValida(CORPO, assinar(CORPO), SEGREDO)).toBe(true);
  });

  it("recusa assinatura feita com OUTRO segredo", () => {
    // É o caso da implantação com a variável errada.
    expect(assinaturaValida(CORPO, assinar(CORPO, "outro"), SEGREDO)).toBe(false);
  });

  it("recusa quando o corpo mudou um único byte", () => {
    const outro = Buffer.from(JSON.stringify({ object: "whatsapp_business_accounx" }));
    expect(assinaturaValida(outro, assinar(CORPO), SEGREDO)).toBe(false);
  });

  it("recusa sem cabeçalho, sem corpo cru e sem segredo", () => {
    expect(assinaturaValida(CORPO, undefined, SEGREDO)).toBe(false);
    expect(assinaturaValida(undefined, assinar(CORPO), SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, assinar(CORPO), "")).toBe(false);
  });

  it("recusa algoritmo diferente de sha256", () => {
    const hex = createHmac("sha256", SEGREDO).update(CORPO).digest("hex");
    expect(assinaturaValida(CORPO, `sha1=${hex}`, SEGREDO)).toBe(false);
    expect(assinaturaValida(CORPO, hex, SEGREDO)).toBe(false);
  });

  it("assinatura de tamanho errado não lança — devolve falso", () => {
    expect(assinaturaValida(CORPO, "sha256=abcd", SEGREDO)).toBe(false);
  });
});

describe("WebhookSignatureAlarm — rejeição em massa acorda alguém (DL-080)", () => {
  let alarme: WebhookSignatureAlarm;
  let erros: jest.SpyInstance;

  beforeEach(() => {
    alarme = new WebhookSignatureAlarm();
    erros = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejeição isolada NÃO alarma — é ataque ou ruído da internet", () => {
    alarme.registrarRejeicao("assinatura não confere");
    alarme.registrarRejeicao("assinatura não confere");
    expect(erros).not.toHaveBeenCalled();
  });

  it("muitas rejeições SEM nenhuma aceita alarmam — é configuração nossa", () => {
    for (let i = 0; i < 5; i += 1) {
      alarme.registrarRejeicao("assinatura não confere");
    }
    expect(erros).toHaveBeenCalledTimes(1);
    expect(erros.mock.calls[0][0]).toContain("WHATSAPP_APP_SECRET");
  });

  it("com tráfego legítimo junto NÃO alarma, por mais rejeições que haja", () => {
    // O sinal que separa "segredo errado" de "ruído" não é a quantidade: é a
    // AUSÊNCIA de acerto na mesma janela. Ataque convive com tráfego legítimo;
    // variável errada, não.
    alarme.registrarAceita();
    for (let i = 0; i < 20; i += 1) {
      alarme.registrarRejeicao("assinatura não confere");
    }
    expect(erros).not.toHaveBeenCalled();
    expect(alarme.contagem).toEqual({ rejeicoes: 20, aceitas: 1 });
  });

  it("não inunda o log: alarma uma vez por janela de silêncio", () => {
    for (let i = 0; i < 40; i += 1) {
      alarme.registrarRejeicao("assinatura não confere");
    }
    expect(erros).toHaveBeenCalledTimes(1);
  });
});
