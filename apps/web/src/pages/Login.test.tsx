import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Login } from "./Login";

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

  it("login com sucesso navega para /", async () => {
    loginMock.mockResolvedValue(undefined);
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
    // /login genérico → sem slug (undefined); dev tenant-único resolve no back.
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith("dono@x.dev", "segredo", undefined),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });

  it("em /app/{slug}/login envia o slug da rota no login (DL-050)", async () => {
    loginMock.mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={["/app/salao-a/login"]}>
        <Routes>
          <Route path="/app/:slug/login" element={<Login />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "dono@x.dev" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "segredo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith("dono@x.dev", "segredo", "salao-a"),
    );
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

  it("login com erro exibe mensagem", async () => {
    loginMock.mockRejectedValue(new Error("bad"));
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "dono@x.dev" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "errada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
