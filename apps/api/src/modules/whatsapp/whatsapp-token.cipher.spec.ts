import { ConfigService } from "@nestjs/config";
import { WhatsAppTokenCipher, segredosIguais } from "./whatsapp-token.cipher";
import { WhatsAppConfigException } from "./whatsapp.errors";

const CHAVE_A = "a".repeat(64);
const CHAVE_B = "b".repeat(64);
const TOKEN = "EAAG1234567890TokenDeOperacaoEmNomeDoCliente";

function cipherCom(chave?: string): WhatsAppTokenCipher {
  const config = {
    get: (nome: string) => (nome === "WHATSAPP_TOKEN_KEY" ? chave : undefined),
  } as unknown as ConfigService;
  return new WhatsAppTokenCipher(config);
}

describe("WhatsAppTokenCipher (Story 6.1, DL-084)", () => {
  it("cifra e decifra de volta o mesmo token", () => {
    const cipher = cipherCom(CHAVE_A);
    expect(cipher.decrypt(cipher.encrypt(TOKEN))).toBe(TOKEN);
  });

  it("o texto guardado NÃO contém o token", () => {
    // O ponto inteiro do exercício: o que vai para a coluna não pode ser o
    // segredo, nem um pedaço dele.
    const guardado = cipherCom(CHAVE_A).encrypt(TOKEN);
    expect(guardado).not.toContain(TOKEN);
    expect(guardado).not.toContain(TOKEN.slice(0, 12));
    expect(guardado.startsWith("v1:")).toBe(true);
  });

  it("cifrar duas vezes o MESMO token dá resultados diferentes", () => {
    // IV aleatório por gravação. Sem isso, duas empresas com o mesmo token
    // teriam a mesma linha — e olhar o banco diria isso de graça.
    const cipher = cipherCom(CHAVE_A);
    expect(cipher.encrypt(TOKEN)).not.toBe(cipher.encrypt(TOKEN));
  });

  it("FAIL-CLOSED: sem WHATSAPP_TOKEN_KEY não cifra nem decifra", () => {
    // A alternativa ("sem chave, guarda em texto puro") faria produção subir sem
    // a variável e ninguém descobrir. Cifra opcional é cifra que não existe.
    const cipher = cipherCom(undefined);
    expect(() => cipher.encrypt(TOKEN)).toThrow(WhatsAppConfigException);
    expect(cipher.configurada).toBe(false);
  });

  it("chave com formato errado é recusada com o motivo", () => {
    expect(() => cipherCom("chave-curta").encrypt(TOKEN)).toThrow(
      /64 caracteres hexadecimais/,
    );
  });

  it("chave TROCADA não decifra — e o erro diz o que fazer", () => {
    const guardado = cipherCom(CHAVE_A).encrypt(TOKEN);
    expect(() => cipherCom(CHAVE_B).decrypt(guardado)).toThrow(
      /WHATSAPP_TOKEN_KEY mudou desde a gravação/,
    );
  });

  it("linha ADULTERADA no banco não decifra (GCM autentica)", () => {
    // Token trocado direto no banco falha alto, em vez de virar uma requisição
    // estranha à Meta com um valor que ninguém escolheu.
    const cipher = cipherCom(CHAVE_A);
    const partes = cipher.encrypt(TOKEN).split(":");
    const adulterado = [
      partes[0],
      partes[1],
      partes[2],
      Buffer.from("outra coisa").toString("base64"),
    ].join(":");
    expect(() => cipher.decrypt(adulterado)).toThrow(WhatsAppConfigException);
  });

  it("formato desconhecido é recusado SEM ecoar o conteúdo", () => {
    try {
      cipherCom(CHAVE_A).decrypt("token-em-texto-puro-de-antigamente");
      fail("deveria ter lançado");
    } catch (erro) {
      expect((erro as Error).message).not.toContain("token-em-texto-puro");
    }
  });
});

describe("segredosIguais", () => {
  it("compara valores iguais e diferentes", () => {
    expect(segredosIguais("abc", "abc")).toBe(true);
    expect(segredosIguais("abc", "abd")).toBe(false);
  });

  it("tamanhos diferentes não lançam — devolvem falso", () => {
    // `timingSafeEqual` lança com tamanhos distintos, e esse é justamente o caso
    // mais comum (segredo errado costuma ter outro tamanho).
    expect(segredosIguais("abc", "abcdef")).toBe(false);
  });

  it("vazio nunca casa — nem com vazio", () => {
    // Senão, variável de ambiente ausente dos dois lados viraria "confere".
    expect(segredosIguais("", "")).toBe(false);
  });
});
