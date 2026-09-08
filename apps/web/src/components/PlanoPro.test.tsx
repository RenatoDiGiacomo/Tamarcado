import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider } from "../auth/AuthContext";
import { ComCoroa, CoroaPro } from "./PlanoPro";

/**
 * Story 6.15 (DL-075) — a coroa é o marcador PADRÃO de recurso bloqueado, ligado
 * à capability. Não é um ícone da tela de WhatsApp: Financeiro, Dashboard e
 * limite de equipe herdam o mesmo componente quando virarem pagos.
 */

// O branding (nome do salão) vem do /installation — mockado para o link do
// WhatsApp poder ser verificado sem subir a API.
vi.mock("../lib/useInstallation", () => ({
  useInstallation: () => ({
    name: "Salão da Rê",
    logoUrl: null,
    primaryColor: null,
  }),
  refreshInstallation: vi.fn(),
}));

function comProviders(ui: ReactNode) {
  return (
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("CoroaPro — o marcador", () => {
  it("aparece como controle acessível, anunciando o motivo", () => {
    render(comProviders(<CoroaPro capability="whatsapp_bot" />));
    const marcador = screen.getByRole("button", {
      name: /disponível no plano pró/i,
    });
    expect(marcador).toBeInTheDocument();
  });

  it("clicar abre o MODAL com o que o recurso faz pela dona", () => {
    render(comProviders(<CoroaPro capability="whatsapp_bot" />));
    fireEvent.click(screen.getByRole("button", { name: /plano pró/i }));
    expect(
      screen.getByRole("dialog", { name: /agendamento pelo whatsapp/i }),
    ).toBeInTheDocument();
    // Benefício em linguagem de dona de salão, não nome técnico.
    expect(screen.getByText(/marcam horário pelo whatsapp/i)).toBeInTheDocument();
  });

  it("o modal NÃO mostra preço (DL-075)", async () => {
    render(comProviders(<CoroaPro capability="whatsapp_bot" />));
    fireEvent.click(screen.getByRole("button", { name: /plano pró/i }));
    const dialog = await screen.findByRole("dialog");
    // Preço aqui prenderia a decisão comercial antes do primeiro cliente pagante
    // e contradiria a landing, que hoje vende plano único.
    expect(dialog.textContent ?? "").not.toMatch(
      /R\$|\d+[,.]\d{2}|\breais\b|\bmensalidade\b/i,
    );
  });

  it("o botão leva ao WhatsApp COMERCIAL, com o salão identificado e em nova aba", async () => {
    render(comProviders(<CoroaPro capability="whatsapp_bot" />));
    fireEvent.click(screen.getByRole("button", { name: /plano pró/i }));
    const link = await screen.findByRole("link", { name: /quero saber mais/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("wa.me/5511998325320");
    // NÃO a WABA de desenvolvimento (94245-8672) — lá atende o bot.
    expect(href).not.toContain("94245");
    const texto = decodeURIComponent(new URL(href).searchParams.get("text") ?? "");
    expect(texto).toBe(
      "Olá! Sou do Salão da Rê e quero fazer o update para o plano Pró.",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel") ?? "").toContain("noopener");
  });

  it("o clique na coroa NÃO navega (ela vive dentro de links de menu)", () => {
    const onNavigate = vi.fn();
    render(
      comProviders(
        <a href="/financeiro" onClick={onNavigate}>
          Financeiro <CoroaPro capability="whatsapp_bot" />
        </a>,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /plano pró/i }));
    // Sem o stopPropagation, clicar no marcador levaria justamente para a rota
    // bloqueada — o oposto da jornada de venda.
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ComCoroa — nenhum vestígio quando a empresa TEM o recurso", () => {
  it("liberado: só o conteúdo, sem coroa, sem espaço reservado, sem tooltip", () => {
    const { container } = render(
      comProviders(
        <ComCoroa bloqueado={false} capability="whatsapp_bot">
          <span>WhatsApp</span>
        </ComCoroa>,
      ),
    );
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plano pró/i })).toBeNull();
    // AC final da 6.15: nem wrapper extra fica para trás.
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("bloqueado: o conteúdo continua visível E ganha a coroa (não some)", async () => {
    render(
      comProviders(
        <ComCoroa bloqueado capability="lembrete_automatico">
          <span>Lembrete automático</span>
        </ComCoroa>,
      ),
    );
    // O objetivo aqui é VENDER: o item aparece marcado, nunca sumido.
    expect(screen.getByText("Lembrete automático")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /plano pró/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: /lembrete automático/i }),
      ).toBeInTheDocument();
    });
  });
});
