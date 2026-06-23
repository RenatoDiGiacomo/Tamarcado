import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
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
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith("dono@x.dev", "segredo"),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
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
