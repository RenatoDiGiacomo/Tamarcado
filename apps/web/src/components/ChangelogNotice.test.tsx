import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChangelogNotice } from "./ChangelogNotice";

// Fixa a versão atual numa que TEM novidades no changelog real.
vi.mock("../lib/version", () => ({
  APP_VERSION_RAW: "1.1.0-beta",
  APP_VERSION: "v1.1b",
  formatVersion: (v: string) => v,
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", accessLevel: "owner" } }),
}));

describe("ChangelogNotice (aviso de atualização)", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it("mostra as novidades da versão quando o usuário ainda não viu", async () => {
    render(<ChangelogNotice />);
    expect(await screen.findByText("Novidades desta atualização")).toBeInTheDocument();
    // Traz um item em linguagem de usuário (fonte: lib/changelog).
    expect(screen.getByText(/Pagamento à equipe/)).toBeInTheDocument();
  });

  it("ao fechar, marca como vista e NÃO volta a aparecer", async () => {
    const { unmount } = render(<ChangelogNotice />);
    await screen.findByText("Novidades desta atualização");
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    await waitFor(() =>
      expect(screen.queryByText("Novidades desta atualização")).toBeNull(),
    );
    expect(localStorage.getItem("tamarcado.changelogSeen.u1")).toBe("1.1.0-beta");
    // Nova montagem (novo acesso) → não mostra mais.
    unmount();
    render(<ChangelogNotice />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText("Novidades desta atualização")).toBeNull();
  });
});
