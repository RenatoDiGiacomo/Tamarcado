import { describe, expect, it } from "vitest";
import {
  conteudoDoRecurso,
  linkWhatsAppUpgrade,
  WHATSAPP_COMERCIAL,
} from "./plano-pro";

/**
 * Story 6.15 (DL-075) — o conteúdo comercial do bloqueio.
 *
 * O que estes testes protegem é dinheiro e tempo do Renato: número errado manda
 * o cliente para o bot, mensagem sem o nome do salão faz a venda começar
 * perguntando "quem é você?", e preço no código prende a decisão comercial.
 */
describe("linkWhatsAppUpgrade — o caminho até a venda", () => {
  it("usa o WhatsApp COMERCIAL, não a WABA de desenvolvimento", () => {
    // (11) 99832-5320 é o da landing page. O 94245-8672 é a WABA de
    // desenvolvimento e estará OCUPADA com a API do bot a partir do Épico 6 —
    // mandar cliente para lá é mandar cliente para o robô (DL-075, item 1).
    expect(WHATSAPP_COMERCIAL).toBe("5511998325320");
    expect(linkWhatsAppUpgrade("Salão Teste")).toContain("wa.me/5511998325320");
    expect(linkWhatsAppUpgrade("Salão Teste")).not.toContain("94245");
  });

  it("identifica o ESTABELECIMENTO na mensagem, codificado na URL", () => {
    const link = linkWhatsAppUpgrade("Studio Raíza");
    const texto = decodeURIComponent(new URL(link).searchParams.get("text") ?? "");
    expect(texto).toBe(
      "Olá! Sou do Studio Raíza e quero fazer o update para o plano Pró.",
    );
  });

  it("codifica acento, espaço e & sem quebrar a URL", () => {
    // Nome real de salão tem acento e "&" ("Corte & Cor"). Sem codificar, o "&"
    // cortaria a mensagem no meio e o Renato receberia meia frase.
    const link = linkWhatsAppUpgrade("Corte & Cor Ateliê");
    expect(link).not.toContain(" ");
    const texto = decodeURIComponent(new URL(link).searchParams.get("text") ?? "");
    expect(texto).toContain("Corte & Cor Ateliê");
  });

  it("sem o nome (branding ainda carregando) não gera frase quebrada", () => {
    for (const vazio of [null, "", "   "]) {
      const texto = decodeURIComponent(
        new URL(linkWhatsAppUpgrade(vazio)).searchParams.get("text") ?? "",
      );
      expect(texto).toBe("Olá! Quero fazer o update para o plano Pró.");
      expect(texto).not.toContain("Sou do  e");
    }
  });
});

describe("conteudoDoRecurso — linguagem de dona de salão, sem preço", () => {
  it("descreve o que o recurso faz por ela, não o nome técnico", () => {
    const bot = conteudoDoRecurso("whatsapp_bot");
    expect(bot.titulo).toBe("Agendamento pelo WhatsApp");
    expect(bot.beneficios.length).toBeGreaterThan(0);
  });

  it("as duas metades do Pró têm conteúdo PRÓPRIO (vendem-se separadas)", () => {
    const bot = conteudoDoRecurso("whatsapp_bot");
    const lembrete = conteudoDoRecurso("lembrete_automatico");
    expect(bot.titulo).not.toBe(lembrete.titulo);
    expect(bot.resumo).not.toBe(lembrete.resumo);
  });

  it("NENHUM texto cita preço (DL-075)", () => {
    // Preço aqui prenderia a decisão comercial antes do primeiro cliente pagante
    // e criaria contradição com a landing, que hoje vende plano único.
    const textos = ["whatsapp_bot", "lembrete_automatico", undefined].flatMap(
      (chave) => {
        const c = conteudoDoRecurso(chave);
        return [c.titulo, c.resumo, ...c.beneficios];
      },
    );
    for (const texto of textos) {
      expect(texto).not.toMatch(/R\$|\d+[,.]\d{2}|\breais\b|\bmensalidade\b/i);
    }
  });

  it("chave desconhecida cai no genérico, sem quebrar e sem descrever outro recurso", () => {
    const generico = conteudoDoRecurso(undefined);
    expect(generico.titulo).toBe("Recurso do plano Pró");
    expect(conteudoDoRecurso("recurso_que_nao_existe").titulo).toBe(
      generico.titulo,
    );
  });
});
