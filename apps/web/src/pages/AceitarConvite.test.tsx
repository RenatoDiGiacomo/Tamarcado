import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AceitarConvite } from "./AceitarConvite";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

const applyMock = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ applySession: applyMock }),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/aceitar-convite" element={<AceitarConvite />} />
        <Route path="/" element={<div>PAINEL</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AceitarConvite", () => {
  beforeEach(() => {
    apiMock.mockReset();
    applyMock.mockReset();
    apiMock.mockResolvedValue(jsonRes({ accessToken: "a", refreshToken: "r" }));
  });

  it("sem token → mostra link inválido (não pede senha)", () => {
    renderAt("/aceitar-convite");
    expect(screen.getByText(/link de convite inválido/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nova senha")).toBeNull();
  });

  it("mostra o aceite de Termos e Política ao criar a conta", () => {
    renderAt("/aceitar-convite?token=abc");
    expect(
      screen.getByRole("link", { name: "Termos de Uso" }),
    ).toHaveAttribute("href", "https://tamarcado.tec.br/termos-de-uso/");
    expect(
      screen.getByRole("link", { name: "Política de Privacidade" }),
    ).toHaveAttribute(
      "href",
      "https://tamarcado.tec.br/politica-de-privacidade/",
    );
  });

  it("senha curta → erro (não chama a API)", async () => {
    renderAt("/aceitar-convite?token=xyz");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /criar senha/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ao menos 8 caracteres/i);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("senhas diferentes → erro (não chama a API)", async () => {
    renderAt("/aceitar-convite?token=xyz");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senha1234" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "outra1234" } });
    fireEvent.click(screen.getByRole("button", { name: /criar senha/i }));
    expect(await screen.findByText(/não coincidem/i)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("sucesso → aceita, aplica a sessão e entra no painel", async () => {
    renderAt("/aceitar-convite?token=xyz");
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senha1234" } });
    fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "senha1234" } });
    fireEvent.click(screen.getByRole("button", { name: /criar senha/i }));

    await waitFor(() => expect(applyMock).toHaveBeenCalledWith("a", "r"));
    const post = apiMock.mock.calls.find(([p]) => p === "/auth/accept-invite");
    expect(post?.[1].body).toEqual({ token: "xyz", password: "senha1234" });
    expect(await screen.findByText("PAINEL")).toBeInTheDocument();
  });
});
