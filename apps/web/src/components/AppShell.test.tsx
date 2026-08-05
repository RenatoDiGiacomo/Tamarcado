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

const usePendentesMock = vi.fn();
vi.mock("../lib/usePendentes", () => ({
  usePendentes: () => usePendentesMock(),
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
    usePendentesMock.mockReset();
    usePendentesMock.mockReturnValue({ count: 0, refresh: vi.fn() });
  });

  it("desktop (≥768px): sidebar com Configurações para owner; Pagamentos oculto (2.1.NN)", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    renderShell();
    expect(
      screen.getByRole("navigation", { name: /lateral/i }),
    ).toBeInTheDocument();
    // Pagamentos foi ocultado (volta depois, provavelmente como "Financeiro") —
    // o item segue no código, só não renderiza.
    expect(screen.queryByText("Pagamentos")).toBeNull();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });

  it("desktop: Clientes navega (4.1); Pagamentos está oculto (2.1.NN)", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(true);
    renderShell();
    // Clientes agora tem tela (Story 4.1) → é link navegável.
    expect(screen.getByRole("link", { name: /Clientes/ })).toBeInTheDocument();
    // Pagamentos oculto: nem link, nem rótulo, nem "em breve".
    expect(screen.queryByRole("link", { name: /Pagamentos/ })).toBeNull();
    expect(screen.queryByText("Pagamentos")).toBeNull();
    expect(screen.queryByText("em breve")).toBeNull();
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

  it("Pendentes (5B.3): owner/gerente veem o item com o contador no badge", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    usePendentesMock.mockReturnValue({ count: 3, refresh: vi.fn() });
    mockMatchMedia(true);
    renderShell();
    const link = screen.getByRole("link", { name: /Pendentes/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/pendentes");
    expect(screen.getByLabelText("3 pendentes")).toBeInTheDocument();
  });

  it("Pendentes: sem pendentes (count 0) não mostra badge", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Gestor", accessLevel: "manager", theme: "light" },
      logout: vi.fn(),
    });
    usePendentesMock.mockReturnValue({ count: 0, refresh: vi.fn() });
    mockMatchMedia(true);
    renderShell();
    expect(screen.getByRole("link", { name: /Pendentes/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/pendentes$/)).toBeNull();
  });

  it("Pendentes: basic não vê o item (owner/gerente apenas)", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Profissional", accessLevel: "basic", theme: "light" },
      logout: vi.fn(),
    });
    usePendentesMock.mockReturnValue({ count: 0, refresh: vi.fn() });
    mockMatchMedia(true);
    renderShell();
    expect(screen.queryByRole("link", { name: /Pendentes/ })).toBeNull();
  });

  it("mobile (<768px): tab bar de 4 abas + FAB direto para Novo agendamento (Épico 7)", () => {
    useAuthMock.mockReturnValue({
      user: { name: "Dono", accessLevel: "owner", theme: "light" },
      logout: vi.fn(),
    });
    mockMatchMedia(false);
    renderShell();
    expect(
      screen.getByRole("navigation", { name: /inferior/i }),
    ).toBeInTheDocument();
    // FAB único (calendar-plus) — sem mais o botão "Ações rápidas".
    expect(
      screen.getByRole("button", { name: /novo agendamento/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /ações rápidas/i }),
    ).toBeNull();
    // Configurações vira aba no mobile (owner).
    expect(screen.getByRole("link", { name: /Configurações/ })).toBeInTheDocument();
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
