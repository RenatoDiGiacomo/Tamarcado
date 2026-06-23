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
    expect(
      await screen.findByRole("heading", { name: /Tamarcado/i }),
    ).toBeInTheDocument();
  });
});
