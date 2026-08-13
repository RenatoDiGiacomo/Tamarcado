import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  authedRequest,
  consumeSessionExpired,
  setSessionExpiredHandler,
} from "./session";

// Mocka só o apiRequest; preserva ApiConnectionError (classe usada em session.ts).
const apiMock = vi.fn();
vi.mock("./api", async (importActual) => {
  const actual = await importActual<typeof import("./api")>();
  return { ...actual, apiRequest: (...a: unknown[]) => apiMock(...a) };
});

function res(status: number, body?: unknown): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("authedRequest — renovação automática de sessão", () => {
  beforeEach(() => {
    apiMock.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    setSessionExpiredHandler(null);
  });

  it("token válido → não faz refresh, envia com o access atual", async () => {
    localStorage.setItem("tamarcado.access", "a1");
    apiMock.mockResolvedValueOnce(res(200, { ok: true }));
    const r = await authedRequest("/x");
    expect(r.status).toBe(200);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith("/x", { token: "a1" });
  });

  it("401 → refresh OK → refaz a requisição com o token novo (usuário não percebe)", async () => {
    localStorage.setItem("tamarcado.access", "old");
    localStorage.setItem("tamarcado.refresh", "r1");
    apiMock
      .mockResolvedValueOnce(res(401)) // 1) /x com token velho
      .mockResolvedValueOnce(res(200, { accessToken: "new" })) // 2) /auth/refresh
      .mockResolvedValueOnce(res(200, { data: 1 })); // 3) /x com token novo
    const r = await authedRequest("/x");
    expect(r.status).toBe(200);
    expect(localStorage.getItem("tamarcado.access")).toBe("new");
    expect(apiMock).toHaveBeenNthCalledWith(3, "/x", { token: "new" });
  });

  it("401 + refresh também vencido → encerra sessão, marca expirada e chama o handler", async () => {
    localStorage.setItem("tamarcado.access", "old");
    localStorage.setItem("tamarcado.refresh", "r1");
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    apiMock
      .mockResolvedValueOnce(res(401)) // /x
      .mockResolvedValueOnce(res(401)); // /auth/refresh vencido
    const r = await authedRequest("/x");
    expect(r.status).toBe(401);
    expect(localStorage.getItem("tamarcado.access")).toBeNull();
    expect(localStorage.getItem("tamarcado.refresh")).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(consumeSessionExpired()).toBe(true);
  });

  it("erro de REDE no refresh propaga (não desloga por blip de conexão)", async () => {
    const { ApiConnectionError } = await import("./api");
    localStorage.setItem("tamarcado.access", "old");
    localStorage.setItem("tamarcado.refresh", "r1");
    apiMock
      .mockResolvedValueOnce(res(401)) // /x
      .mockRejectedValueOnce(new ApiConnectionError()); // /auth/refresh sem rede
    await expect(authedRequest("/x")).rejects.toBeInstanceOf(ApiConnectionError);
    // sessão preservada — não foi expiração, foi rede
    expect(localStorage.getItem("tamarcado.access")).toBe("old");
  });
});
