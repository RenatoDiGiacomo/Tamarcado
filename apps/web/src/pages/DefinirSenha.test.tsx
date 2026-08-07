import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DefinirSenha } from "./DefinirSenha";

const apiMock = vi.fn();
const applySession = vi.fn();
const navigateMock = vi.fn();
vi.mock("../lib/api", () => ({ apiRequest: (...a: unknown[]) => apiMock(...a) }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ applySession }) }));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}
const renderAt = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/definir-senha${search}`]}>
      <DefinirSenha />
    </MemoryRouter>,
  );

describe("DefinirSenha", () => {
  beforeEach(() => {
    apiMock.mockReset();
    applySession.mockReset();
    navigateMock.mockReset();
  });

  it("token ausente → mensagem clara, sem formulário", () => {
    renderAt("");
    expect(screen.getByText(/token está ausente/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).toBeNull();
  });

  it("sucesso: define a senha, aplica a sessão e navega", async () => {
    apiMock.mockResolvedValue(jsonRes({ accessToken: "a", refreshToken: "r" }));
    renderAt("?token=abc");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha1" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "novaSenha1" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar nova senha/i }));
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith("/auth/accept-invite", {
        method: "POST",
        body: { token: "abc", password: "novaSenha1" },
      });
    });
    await waitFor(() => expect(applySession).toHaveBeenCalledWith("a", "r"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });

  it("link expirado/usado (backend 400) → mensagem clara, não genérica", async () => {
    apiMock.mockResolvedValue(jsonRes({ message: "Convite inválido ou expirado" }, false));
    renderAt("?token=velho");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha1" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "novaSenha1" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar nova senha/i }));
    expect(
      await screen.findByText(/este link expirou ou já foi usado/i),
    ).toBeInTheDocument();
  });

  it("senhas diferentes → erro, não chama a API", async () => {
    renderAt("?token=abc");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "novaSenha1" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "outra" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar nova senha/i }));
    expect(await screen.findByText(/não coincidem/i)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
