import { describe, it, expect, vi, afterEach } from "vitest";
import { apiRequest, ApiConnectionError } from "./api";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("apiRequest — transporte vs. resposta de erro", () => {
  it("resolve com a Response mesmo em 4xx (erro HTTP NÃO é falha de conexão)", async () => {
    const res = { ok: false, status: 401 } as Response;
    global.fetch = vi.fn().mockResolvedValue(res);
    const out = await apiRequest("/auth/login", { method: "POST", body: {} });
    expect(out.status).toBe(401);
  });

  it("rejeita com ApiConnectionError quando o fetch falha (rede/CORS/DNS)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiRequest("/auth/login")).rejects.toBeInstanceOf(
      ApiConnectionError,
    );
  });

  it("rejeita com ApiConnectionError quando o fetch é abortado (timeout)", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("aborted"), { name: "AbortError" }),
      );
    await expect(apiRequest("/health")).rejects.toBeInstanceOf(
      ApiConnectionError,
    );
  });
});
