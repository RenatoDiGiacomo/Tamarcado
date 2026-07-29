import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicAgendar } from "./PublicAgendar";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/agendar/:slug" element={<PublicAgendar />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicAgendar (rota pública 5B.1)", () => {
  beforeEach(() => apiMock.mockReset());

  it("mostra o branding do estabelecimento e os serviços (texto neutro)", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/public/salao-a/installation") {
        return Promise.resolve(
          jsonRes({ name: "Salão A", logoUrl: null, primaryColor: "#B85C38" }),
        );
      }
      if (path === "/public/salao-a/services") {
        return Promise.resolve(
          jsonRes({
            services: [
              { id: "1", name: "Corte", durationMinutes: 60, price: "50.00" },
              { id: "2", name: "Sobrancelha", durationMinutes: 30, price: null },
            ],
          }),
        );
      }
      return Promise.resolve(jsonRes({}));
    });
    renderAt("/agendar/salao-a");

    // Branding (nome, já que sem logo) + copy neutra.
    expect(await screen.findByText("Salão A")).toBeInTheDocument();
    expect(screen.getByText("Agende seu horário")).toBeInTheDocument();
    // Serviços com duração e preço (sob consulta quando null).
    expect(screen.getByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("R$ 50,00")).toBeInTheDocument();
    expect(screen.getByText("Sobrancelha")).toBeInTheDocument();
    expect(screen.getByText("Sob consulta")).toBeInTheDocument();
    // Texto NEUTRO (DL-048): não fala "salão".
    expect(
      screen.getByText(/o estabelecimento confirma o seu horário/i),
    ).toBeInTheDocument();
  });

  it("aplica a cor primária do estabelecimento na variável CSS", async () => {
    apiMock.mockImplementation((path?: string) => {
      if (path === "/public/salao-x/installation") {
        return Promise.resolve(
          jsonRes({ name: "X", logoUrl: null, primaryColor: "#6C63FF" }),
        );
      }
      return Promise.resolve(jsonRes({ services: [] }));
    });
    renderAt("/agendar/salao-x");
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--primary"),
      ).toBe("243 100% 69%"),
    );
  });

  it("slug inexistente (404) → mensagem de não encontrado", async () => {
    apiMock.mockResolvedValue(jsonRes({}, false));
    renderAt("/agendar/nao-existe");
    expect(
      await screen.findByText(/estabelecimento não encontrado/i),
    ).toBeInTheDocument();
  });
});
