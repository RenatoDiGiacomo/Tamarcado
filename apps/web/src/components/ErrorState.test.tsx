import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ErrorState, capabilityFrom, errorKindFrom } from "./ErrorState";
import { ApiConnectionError, ApiForbiddenError } from "../lib/api";
import { AuthProvider } from "../auth/AuthContext";

/** O bloqueio usa AuthContext (capabilities) e links — precisa dos providers. */
function comProviders(ui: React.ReactNode) {
  return (
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe("ErrorState", () => {
  it("SEM CONEXÃO: mensagem própria de rede + tentar de novo", () => {
    const onRetry = vi.fn();
    render(<ErrorState kind="connection" resource="a agenda" onRetry={onRetry} />);
    expect(screen.getByText("Sem conexão")).toBeInTheDocument();
    expect(screen.getByText(/conectar ao servidor/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ERRO DO SERVIDOR: mensagem distinta, nomeando o recurso", () => {
    render(<ErrorState kind="server" resource="os clientes" onRetry={() => {}} />);
    expect(
      screen.getByText("Não foi possível carregar os clientes"),
    ).toBeInTheDocument();
    expect(screen.getByText(/problema no servidor/i)).toBeInTheDocument();
    // A mensagem de conexão NÃO aparece — os dois estados são distintos.
    expect(screen.queryByText("Sem conexão")).toBeNull();
  });

  it("errorKindFrom distingue transporte de erro de servidor", () => {
    expect(errorKindFrom(new ApiConnectionError())).toBe("connection");
    expect(errorKindFrom(new Error("boom"))).toBe("server");
    expect(errorKindFrom("qualquer coisa")).toBe("server");
  });

  // ── Story 6.15: bloqueio NÃO é falha ──────────────────────────────────────
  //
  // Antes desta story todo 403 caía em `server`, e o dono via "Tivemos um
  // problema no servidor. Tente de novo em instantes" com um botão que nunca ia
  // funcionar. Bloqueio comercial com cara de defeito.

  it("errorKindFrom separa os TRÊS 403 pelo campo `reason`, não pelo texto", () => {
    expect(errorKindFrom(new ApiForbiddenError("capability", "whatsapp_bot"))).toBe(
      "capability",
    );
    // `module` e `role` são motivos distintos no backend, mas a mesma coisa para
    // quem está na tela: quem libera é o dono do estabelecimento.
    expect(errorKindFrom(new ApiForbiddenError("module", undefined, "financeiro"))).toBe(
      "permission",
    );
    expect(errorKindFrom(new ApiForbiddenError("role"))).toBe("permission");
  });

  it("capabilityFrom entrega a chave barrada, para o texto de venda certo", () => {
    expect(capabilityFrom(new ApiForbiddenError("capability", "lembrete_automatico"))).toBe(
      "lembrete_automatico",
    );
    expect(capabilityFrom(new ApiForbiddenError("module"))).toBeUndefined();
    expect(capabilityFrom(new Error("boom"))).toBeUndefined();
  });

  it("CAPABILITY: oferta do Pró, e NENHUM botão de tentar de novo", () => {
    render(
      comProviders(
        <ErrorState
          kind="capability"
          resource="os recebimentos"
          capability="whatsapp_bot"
          onRetry={() => {}}
        />,
      ),
    );
    expect(screen.getByText(/Disponível no plano Pró/i)).toBeInTheDocument();
    expect(screen.getByText("Agendamento pelo WhatsApp")).toBeInTheDocument();
    // Não há o que tentar de novo num bloqueio — o botão seria promessa falsa.
    expect(screen.queryByRole("button", { name: /tentar de novo/i })).toBeNull();
    // E não pode restar vestígio da mensagem de defeito.
    expect(screen.queryByText(/problema no servidor/i)).toBeNull();
  });

  it("PERMISSÃO: fala com o dono e NÃO oferece plano nenhum", () => {
    render(
      comProviders(
        <ErrorState kind="permission" resource="o Financeiro" onRetry={() => {}} />,
      ),
    );
    expect(screen.getByText(/não tem acesso a esta área/i)).toBeInTheDocument();
    expect(screen.getByText(/dono do estabelecimento/i)).toBeInTheDocument();
    // O CORAÇÃO da story: quem não tem permissão não recebe oferta de compra —
    // ela não tem como comprar o que o dono já pagou, e cobraria o dono por isso.
    expect(screen.queryByText(/plano Pró/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /quero saber mais/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tentar de novo/i })).toBeNull();
  });

  it("os DOIS bloqueios são visivelmente diferentes entre si", () => {
    const { unmount } = render(
      comProviders(
        <ErrorState
          kind="capability"
          resource="o WhatsApp"
          capability="whatsapp_bot"
          onRetry={() => {}}
        />,
      ),
    );
    const plano = screen.getByRole("alert").textContent ?? "";
    unmount();
    render(
      comProviders(
        <ErrorState kind="permission" resource="o Financeiro" onRetry={() => {}} />,
      ),
    );
    const permissao = screen.getByRole("alert").textContent ?? "";
    // Se estes dois textos coincidissem, a story teria falhado no seu ponto.
    expect(plano).not.toBe(permissao);
  });
});
