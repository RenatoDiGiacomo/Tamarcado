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
  expenses: 300,
  result: 500,
  salesCount: 16,
  averageTicket: 50,
  appointmentsCompleted: 11,
  totalClients: 34,
  avgClientsPerWeek: 5.5,
  revenueSeries: [
    { label: "01/09", value: 110 },
    { label: "02/09", value: 250 },
    { label: "03/09", value: 440 },
  ],
  statusBreakdown: [
    { status: "completed", count: 11 },
    { status: "pending", count: 3 },
  ],
  topClients: [
    { clientId: "c1", name: "Ana Lima", count: 9 },
    { clientId: "c2", name: "Bruno", count: 5 },
  ],
};

describe("Dashboard (Story 5.6)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    vi.mocked(downloadCsv).mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("busca as métricas do período e mostra KPIs + gráficos", async () => {
    apiMock.mockResolvedValue(jsonRes(METRICS));
    render(<Dashboard />);
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(String(apiMock.mock.calls[0][0])).toContain("/dashboard?from=");
    // KPIs
    expect(await screen.findByText("Valor bruto")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*800,00/)).toBeInTheDocument(); // valor bruto
    expect(screen.getByText("Saídas (equipe)")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*300,00/)).toBeInTheDocument(); // saídas
    expect(screen.getByText("Resultado")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*500,00/)).toBeInTheDocument(); // resultado
    expect(screen.getByText("16")).toBeInTheDocument(); // vendas
    expect(screen.getByText("Ticket médio")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*50,00/)).toBeInTheDocument(); // ticket
    expect(screen.getByText("34")).toBeInTheDocument(); // clientes
    // Gráficos: top cliente (barras) + legenda da pizza (status).
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Concluído")).toBeInTheDocument();
  });

  it("filtro Ano refaz a busca com o ano corrente (jan–dez)", async () => {
    apiMock.mockResolvedValue(jsonRes(METRICS));
    render(<Dashboard />);
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    apiMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Ano" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    const url = String(apiMock.mock.calls[0][0]);
    expect(url).toMatch(/from=\d{4}-01-01&to=\d{4}-12-31/);
  });

  it("Exportar CSV: não baixa direto — abre modal e só então gera o CSV", async () => {
    apiMock.mockResolvedValue(jsonRes(METRICS));
    render(<Dashboard />);
    await screen.findByText("Valor bruto");
    fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/ }));
    expect(await screen.findByText("Exportar dashboard")).toBeInTheDocument();
    expect(vi.mocked(downloadCsv)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Exportar$/ }));
    expect(vi.mocked(downloadCsv)).toHaveBeenCalledTimes(1);
    const [filename, content] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toMatch(/^dashboard_.*\.csv$/);
    expect(content).toContain("Valor bruto (recebido);800,00");
    expect(content).toContain("Vendas;16");
    expect(content).toContain("Atendimentos concluídos;11");
    expect(content).toContain("Top cliente 1;Ana Lima (9)");
  });

  it("cada indicador tem dica (significado + cálculo) que abre no clique (mobile)", async () => {
    apiMock.mockResolvedValue(jsonRes(METRICS));
    render(<Dashboard />);
    await screen.findByText("Valor bruto");
    // Fechada por padrão.
    expect(screen.queryByText(/Valor bruto ÷ Atendimentos concluídos/)).toBeNull();
    // Abre a dica do Ticket médio (explica o cálculo).
    fireEvent.click(screen.getByRole("button", { name: "O que é Ticket médio?" }));
    expect(
      screen.getByText(/Valor bruto ÷ Atendimentos concluídos/),
    ).toBeInTheDocument();
    // Gráficos também têm dica.
    fireEvent.click(screen.getByRole("button", { name: /O que é Clientes com maior frequência/ }));
    expect(screen.getByText(/Frequência = número de agendamentos/)).toBeInTheDocument();
  });

  it("estado de erro quando a API falha", async () => {
    apiMock.mockResolvedValue(jsonRes({}, false));
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument(),
    );
  });
});
