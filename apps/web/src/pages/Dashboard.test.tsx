import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import { downloadCsv } from "../lib/csv";

const apiMock = vi.fn();
vi.mock("../lib/session", () => ({
  authedRequest: (...args: unknown[]) => apiMock(...args),
}));
// Espiona o download; toCsv/csvAmount seguem REAIS (valida o CSV de verdade).
vi.mock("../lib/csv", async (orig) => ({
  ...(await orig<typeof import("../lib/csv")>()),
  downloadCsv: vi.fn(),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const METRICS = {
  received: 800,
  pending: 200,
  appointmentsCompleted: 12,
  totalClients: 34,
  avgClientsPerWeek: 5.5,
};

describe("Dashboard (Story 5.6)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    vi.mocked(downloadCsv).mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("busca as métricas do período e mostra os KPIs", async () => {
    apiMock.mockResolvedValue(jsonRes(METRICS));
    render(<Dashboard />);
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(String(apiMock.mock.calls[0][0])).toContain("/dashboard?from=");
    expect(await screen.findByText("Faturamento")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*800,00/)).toBeInTheDocument(); // faturamento
    expect(screen.getByText("12")).toBeInTheDocument(); // atendimentos
    expect(screen.getByText("34")).toBeInTheDocument(); // clientes
    expect(screen.getByText("5.5")).toBeInTheDocument(); // média/semana
  });

  it("troca de período (Dia) refaz a busca com from=to (hoje)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ received: 0, pending: 0, appointmentsCompleted: 0, totalClients: 0, avgClientsPerWeek: 0 }),
    );
    render(<Dashboard />);
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    apiMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Dia" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    const url = String(apiMock.mock.calls[0][0]);
    const m = url.match(/from=([\d-]+)&to=([\d-]+)/);
    expect(m?.[1]).toBe(m?.[2]);
  });

  it("Exportar CSV: não baixa direto — abre modal e só então gera o CSV", async () => {
    apiMock.mockResolvedValue(jsonRes(METRICS));
    render(<Dashboard />);
    await screen.findByText("Faturamento");
    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));
    expect(await screen.findByText("Exportar dashboard")).toBeInTheDocument();
    expect(vi.mocked(downloadCsv)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Exportar$/ }));
    expect(vi.mocked(downloadCsv)).toHaveBeenCalledTimes(1);
    const [filename, content] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toMatch(/^dashboard_.*\.csv$/);
    expect(content).toContain("Faturamento (recebido);800,00");
    expect(content).toContain("Atendimentos concluídos;12");
  });

  it("estado de erro quando a API falha", async () => {
    apiMock.mockResolvedValue(jsonRes({}, false));
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument(),
    );
  });
});
