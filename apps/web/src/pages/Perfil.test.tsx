import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Perfil } from "./Perfil";

const useAuthMock = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("../lib/useInstallation", () => ({
  useInstallation: () => ({ name: "Salão Teste", logoUrl: null, primaryColor: null }),
}));

describe("Perfil", () => {
  beforeEach(() => useAuthMock.mockReset());

  it("mostra o tema atual e alterna via setTheme (AC3)", () => {
    const setTheme = vi.fn();
    useAuthMock.mockReturnValue({
      user: { name: "Dono", email: "d@x.dev", theme: "light", accessLevel: "owner" },
      setTheme,
      logout: vi.fn(),
    });
    render(<Perfil />);
    expect(screen.getByText(/Atual: Claro/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /escuro/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("quando escuro, alterna para claro", () => {
    const setTheme = vi.fn();
    useAuthMock.mockReturnValue({
      user: { name: "Dono", email: "d@x.dev", theme: "dark", accessLevel: "owner" },
      setTheme,
      logout: vi.fn(),
    });
    render(<Perfil />);
    fireEvent.click(screen.getByRole("button", { name: /claro/i }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("tem ação Sair e mostra a versão", () => {
    const logout = vi.fn();
    useAuthMock.mockReturnValue({
      user: { name: "Dono", email: "d@x.dev", theme: "light", accessLevel: "owner" },
      setTheme: vi.fn(),
      logout,
    });
    render(<Perfil />);
    const sair = screen.getByRole("button", { name: /sair/i });
    fireEvent.click(sair);
    expect(logout).toHaveBeenCalled();
    expect(screen.getByText(/^v\d/)).toBeInTheDocument();
  });
});
