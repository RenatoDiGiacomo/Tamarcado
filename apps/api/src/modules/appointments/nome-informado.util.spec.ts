import { nomeInformadoDivergente, tokensDeNome } from "./nome-informado.util";

describe("tokensDeNome", () => {
  it("remove acento, caixa e pontuação; hífen e apóstrofo separam", () => {
    expect(tokensDeNome("Ana-Maria D'Ávila")).toEqual(["ana", "maria", "d", "avila"]);
  });

  it("descarta partículas — sozinhas não identificam ninguém", () => {
    expect(tokensDeNome("Maria de Souza dos Santos")).toEqual([
      "maria",
      "souza",
      "santos",
    ]);
  });
});

describe("nomeInformadoDivergente", () => {
  it("não avisa quando não há nome informado (manual/bot ou antes do DL-071)", () => {
    expect(nomeInformadoDivergente(null, "Rosana")).toBeNull();
    expect(nomeInformadoDivergente("   ", "Rosana")).toBeNull();
  });

  it("não avisa por acento, caixa ou espaço sobrando", () => {
    expect(nomeInformadoDivergente(" rosana ", "Rosana")).toBeNull();
    expect(nomeInformadoDivergente("Mônica", "Monica")).toBeNull();
  });

  it("não avisa quando o informado é parte do cadastro (ou o contrário)", () => {
    expect(nomeInformadoDivergente("Rosana", "Rosana Aparecida Silva")).toBeNull();
    expect(nomeInformadoDivergente("Rosana Silva", "Rosana")).toBeNull();
  });

  it("não avisa por ordem trocada — a comparação é por token", () => {
    expect(nomeInformadoDivergente("Silva Rosana", "Rosana Silva")).toBeNull();
  });

  it("não avisa por abreviação de 3 letras ou mais", () => {
    expect(nomeInformadoDivergente("Rosa", "Rosana")).toBeNull();
  });

  it("não avisa quando só o sobrenome bate (mãe e filha, mesmo cadastro)", () => {
    expect(nomeInformadoDivergente("Ana Silva", "Rosana Silva")).toBeNull();
  });

  it("avisa quando nenhum token bate — o caso que precisa aparecer", () => {
    expect(nomeInformadoDivergente("Teste", "Rosana")).toBe("Teste");
    expect(nomeInformadoDivergente("Ana Paula", "Rosana Silva")).toBe("Ana Paula");
  });

  it("avisa devolvendo o nome COMO FOI DIGITADO (com acento e caixa)", () => {
    expect(nomeInformadoDivergente("  Mônica Cristina ", "Rosana")).toBe(
      "Mônica Cristina",
    );
  });

  it("partícula sozinha dos dois lados não sustenta comparação — não avisa", () => {
    expect(nomeInformadoDivergente("de", "Rosana")).toBeNull();
    expect(nomeInformadoDivergente("Teste", "da")).toBeNull();
  });

  it("inicial isolada não conta como abreviação (evita bater com qualquer nome)", () => {
    expect(nomeInformadoDivergente("R", "Rosana")).toBe("R");
  });
});
