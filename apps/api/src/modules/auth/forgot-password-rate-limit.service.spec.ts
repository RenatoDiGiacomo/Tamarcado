import { HttpException } from "@nestjs/common";
import { ForgotPasswordRateLimitService } from "./forgot-password-rate-limit.service";

describe("ForgotPasswordRateLimitService", () => {
  let limite: ForgotPasswordRateLimitService;

  beforeEach(() => {
    limite = new ForgotPasswordRateLimitService();
  });

  it("deixa passar o uso normal (pediu, não achou o e-mail, pediu de novo)", () => {
    expect(() => limite.assertWithinLimit("1.1.1.1", "ana@x.com")).not.toThrow();
    expect(() => limite.assertWithinLimit("1.1.1.1", "ana@x.com")).not.toThrow();
  });

  it("trava no 4º pedido para o MESMO e-mail, mesmo vindo de IPs diferentes", () => {
    limite.assertWithinLimit("1.1.1.1", "ana@x.com");
    limite.assertWithinLimit("2.2.2.2", "ana@x.com");
    limite.assertWithinLimit("3.3.3.3", "ana@x.com");
    // Encher a caixa de uma pessoa específica é o abuso que isto barra.
    expect(() => limite.assertWithinLimit("4.4.4.4", "ana@x.com")).toThrow(HttpException);
  });

  it("trava o MESMO IP varrendo e-mails diferentes", () => {
    for (let i = 0; i < 10; i++) {
      limite.assertWithinLimit("9.9.9.9", `pessoa${i}@x.com`);
    }
    expect(() => limite.assertWithinLimit("9.9.9.9", "outra@x.com")).toThrow(HttpException);
  });

  it("normaliza o e-mail: maiúsculas e espaços contam como o mesmo endereço", () => {
    limite.assertWithinLimit("1.1.1.1", "ana@x.com");
    limite.assertWithinLimit("1.1.1.1", " ANA@x.com ");
    limite.assertWithinLimit("1.1.1.1", "Ana@X.com");
    expect(() => limite.assertWithinLimit("1.1.1.1", "ana@x.com")).toThrow(HttpException);
  });

  it("a mensagem do 429 não revela se o estouro foi por e-mail ou por IP", () => {
    for (let i = 0; i < 3; i++) limite.assertWithinLimit("1.1.1.1", "ana@x.com");
    try {
      limite.assertWithinLimit("1.1.1.1", "ana@x.com");
      fail("deveria ter lançado");
    } catch (erro) {
      const mensagem = (erro as HttpException).message;
      expect(mensagem).toBe("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      expect(mensagem.toLowerCase()).not.toContain("e-mail");
    }
  });
});
