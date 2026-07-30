import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { App } from "./App";

describe("App", () => {
  it("sem sessão, redireciona para o login (marca Tamarcado)", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    // A marca virou o logo SVG (ajuste 2.1.NN): variações clara/escura, ambas
    // com aria-label "Tamarcado" (uma some por CSS conforme o tema).
    const logos = await screen.findAllByRole("img", { name: /Tamarcado/i });
    expect(logos.length).toBeGreaterThan(0);
  });
});
