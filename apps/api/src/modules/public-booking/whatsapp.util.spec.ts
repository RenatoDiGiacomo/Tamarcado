import { normalizarWhatsapp } from "./public-booking.service";

/**
 * O telefone é digitado à mão em Configurações e vira link `wa.me` na página
 * pública. É a única parte do redesenho da 1ª leva com lógica de verdade — o
 * resto dos campos novos é passagem direta do banco para a tela.
 */
describe("normalizarWhatsapp", () => {
  it("tira máscara e acrescenta o DDI quando falta", () => {
    expect(normalizarWhatsapp("(11) 99832-5320")).toBe("5511998325320");
    expect(normalizarWhatsapp("11 99832 5320")).toBe("5511998325320");
  });

  it("respeita o DDI quando o dono já digitou", () => {
    expect(normalizarWhatsapp("+55 11 99832-5320")).toBe("5511998325320");
    expect(normalizarWhatsapp("5511998325320")).toBe("5511998325320");
  });

  it("aceita fixo com DDD (10 dígitos)", () => {
    expect(normalizarWhatsapp("(11) 3333-4444")).toBe("551133334444");
  });

  it("devolve null quando não dá para montar um número", () => {
    // Melhor a página NÃO mostrar o botão do que mostrar um link que não abre
    // conversa nenhuma.
    expect(normalizarWhatsapp(null)).toBeNull();
    expect(normalizarWhatsapp("")).toBeNull();
    expect(normalizarWhatsapp("99832-5320")).toBeNull(); // sem DDD
    expect(normalizarWhatsapp("liga pro salão")).toBeNull();
  });
});
