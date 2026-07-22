import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

const useAuthMock = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

const useInstallationMock = vi.fn();
vi.mock("../lib/useInstallation", () => ({
  useInstallation: () => useInstallationMock(),
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

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell>
        <div>conteudo</div>
      </AppShell>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    useInstallationMock.mockReset();
    useInstallationMock.mockReturnValue(null);
  });

  it("desktop (≥768px): sidebar com Pagamentos e Configurações para owner", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    renderShell();
    expect(
      screen.getByRole("navigation", { name: /lateral/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pagamentos")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });

  it("desktop: Clientes navega (4.1); Pagamentos fica 'em breve'", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    renderShell();
    // Clientes agora tem tela (Story 4.1) → é link navegável.
    expect(screen.getByRole("link", { name: /Clientes/ })).toBeInTheDocument();
    // Pagamentos ainda sem tela → "em breve", não navegável.
    expect(screen.queryByRole("link", { name: /Pagamentos/ })).toBeNull();
    expect(screen.getByText("em breve")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Agenda/ })).toBeInTheDocument();
  });

  it("desktop: esconde Configurações de não-owner", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Gestor", accessLevel: "manager", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    renderShell();
    expect(screen.queryByText("Configurações")).not.toBeInTheDocument();
  });

  it("mobile (<768px): tabs no rodapé com botão de ações rápidas", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(false);
    renderShell();
    expect(
      screen.getByRole("navigation", { name: /inferior/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ações rápidas/i }),
    ).toBeInTheDocument();
  });

  it("tem ação Sair", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    renderShell();
    expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
  });

  it("exibe o nome da instalação no header e aplica o tema no documento (AC4/AC3)", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "dark" },
      logout: vi.fn(),
    });
    useInstallationMock.mockReturnValue({
      name: "Agenda da Fernanda",
      logoUrl: null,
      primaryColor: "#E91E63",
    });
    mockMatchMedia(true);
    renderShell();
    expect(screen.getByText("Agenda da Fernanda")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
