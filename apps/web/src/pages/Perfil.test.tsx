import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Perfil } from "./Perfil";

const useAuthMock = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

describe("Perfil", () => {
  beforeEach(() => useAuthMock.mockReset());

  it("mostra o tema atual e alterna via setTheme (AC3)", () => {
    const setTheme = vi.fn();
    useAuthMock.mockReturnValue({
      user: { name: "Dono", email: "d@x.dev", theme: "light" },
      setTheme,
    });
    render(<Perfil />);
    expect(screen.getByText(/Tema atual: Claro/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /alternar para escuro/i }),
    );
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("quando escuro, alterna para claro", () => {
    const setTheme = vi.fn();
    useAuthMock.mockReturnValue({
      user: { name: "Dono", email: "d@x.dev", theme: "dark" },
      setTheme,
    });
    render(<Perfil />);
    fireEvent.click(
      screen.getByRole("button", { name: /alternar para claro/i }),
    );
    expect(setTheme).toHaveBeenCalledWith("light");
  });
});
