import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import { apiRequest } from "../lib/api";

vi.mock("../lib/api", () => ({ apiRequest: vi.fn() }));
const mockedApi = apiRequest as unknown as ReturnType<typeof vi.fn>;

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function Probe() {
  const { user, login, isAuthenticated } = useAuth();
  return (
    <div>
      <span data-testid="auth">{isAuthenticated ? "yes" : "no"}</span>
      <span data-testid="name">{user?.name ?? ""}</span>
      <button onClick={() => void login("dono@x.dev", "segredo")}>go</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    mockedApi.mockReset();
  });

  it("inicia deslogado e não chama a API sem token", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth").textContent).toBe("no"),
    );
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it("login guarda os tokens e carrega o perfil", async () => {
    mockedApi
      .mockResolvedValueOnce(jsonRes({ accessToken: "a", refreshToken: "r" }))
      .mockResolvedValueOnce(
        jsonRes({ id: "1", name: "Dono", accessLevel: "owner" }),
      );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth").textContent).toBe("no"),
    );
    fireEvent.click(screen.getByText("go"));
    await waitFor(() =>
      expect(screen.getByTestId("name").textContent).toBe("Dono"),
    );
    expect(localStorage.getItem("tamarcado.access")).toBe("a");
    expect(localStorage.getItem("tamarcado.refresh")).toBe("r");
  });
});
