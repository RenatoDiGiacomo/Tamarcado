import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Login } from "./Login";
import { ApiConnectionError } from "../lib/api";

const loginMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ login: loginMock }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

describe("Login", () => {
  beforeEach(() => {
    loginMock.mockReset();
    navigateMock.mockReset();
  });

  it("renderiza o formulário", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
  });

  it("login por e-mail (sem slug) com sucesso navega para /", async () => {
    loginMock.mockResolvedValue(null); // null = entrou direto (DL-052)
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "dono@x.dev" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "segredo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    // Só e-mail + senha; o backend resolve o tenant (URL única).
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith("dono@x.dev", "segredo"),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });

  it("e-mail em 2 empresas → mostra escolha; ao escolher, loga com companyId (DL-052)", async () => {
    loginMock
      .mockResolvedValueOnce([
        { id: "1", name: "Salão A" },
        { id: "2", name: "Salão B" },
      ])
      .mockResolvedValueOnce(null);
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "dono@x.dev" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "segredo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    // Tela de escolha com os dois estabelecimentos.
    await screen.findByText(/escolha o estabelecimento/i);
    fireEvent.click(screen.getByRole("button", { name: "Salão B" }));

    // Segunda chamada carrega o companyId escolhido, então navega.
    await waitFor(() =>
      expect(loginMock).toHaveBeenLastCalledWith("dono@x.dev", "segredo", "2"),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });

  it("alterna a visibilidade da senha pelo ícone de olho", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const senha = screen.getByLabelText("Senha");
    expect(senha).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: /mostrar senha/i }));
    expect(senha).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /ocultar senha/i }));
    expect(senha).toHaveAttribute("type", "password");
  });

  it("credencial inválida (401) exibe mensagem de senha", async () => {
    loginMock.mockRejectedValue(new Error("Credenciais inválidas"));
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "dono@x.dev" },
    });
    fireEvent.change(screen.getByLabelText("Senha", { exact: true }), {
      target: { value: "errada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/senha incorret/i);
  });

  it("falha de conexão/CORS mostra mensagem de servidor, NÃO de credencial", async () => {
    loginMock.mockRejectedValue(new ApiConnectionError());
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "dono@x.dev" },
    });
    fireEvent.change(screen.getByLabelText("Senha", { exact: true }), {
      target: { value: "tamarcado123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/conectar ao servidor/i);
    expect(alert.textContent).not.toMatch(/senha incorret/i);
  });
});
