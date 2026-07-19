import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Configuracoes } from "./Configuracoes";

const useAuthMock = vi.fn();
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

function renderAt(accessLevel: string) {
  useAuthMock.mockReturnValue({ user: { accessLevel } });
  return render(
    <MemoryRouter initialEntries={["/configuracoes/identidade"]}>
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/configuracoes" element={<Configuracoes />}>
          <Route path="identidade" element={<div>ABA IDENTIDADE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Configuracoes (casca)", () => {
  beforeEach(() => useAuthMock.mockReset());

  it("Dono vê título, abas e a aba ativa (AC1)", () => {
    renderAt("owner");
    expect(screen.getByRole("heading", { name: "Configurações" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Serviços" })).toBeInTheDocument();
    // A aba da URL corrente fica ativa (aria-current do NavLink).
    expect(screen.getByRole("tab", { name: "Identidade visual" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Horários é aba ativa (Story 3.3.2); Equipe segue desabilitada (3.3.3).
    expect(screen.getByRole("tab", { name: "Horários" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(screen.getByRole("tab", { name: "Equipe" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("ABA IDENTIDADE")).toBeInTheDocument();
  });

  it("não-Dono é redirecionado para fora (AC2)", () => {
    renderAt("basic");
    expect(screen.getByText("HOME")).toBeInTheDocument();
    expect(screen.queryByText("ABA IDENTIDADE")).not.toBeInTheDocument();
  });
});
