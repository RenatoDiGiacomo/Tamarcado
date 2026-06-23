import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppShell } from "./AppShell";

const useAuthMock = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

function mockMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("AppShell", () => {
  beforeEach(() => useAuthMock.mockReset());

  it("desktop (≥768px): sidebar com Pagamentos e Configurações para owner", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    render(
      <AppShell>
        <div>conteudo</div>
      </AppShell>,
    );
    expect(
      screen.getByRole("navigation", { name: /lateral/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pagamentos")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });

  it("desktop: esconde Configurações de não-owner", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Gestor", accessLevel: "manager" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    render(<AppShell />);
    expect(screen.queryByText("Configurações")).not.toBeInTheDocument();
  });

  it("mobile (<768px): tabs no rodapé com botão de ações rápidas", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner" },
      logout: vi.fn(),
    });
    mockMatchMedia(false);
    render(<AppShell />);
    expect(
      screen.getByRole("navigation", { name: /inferior/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ações rápidas/i }),
    ).toBeInTheDocument();
  });

  it("tem ação Sair", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    render(<AppShell />);
    expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
  });
});
