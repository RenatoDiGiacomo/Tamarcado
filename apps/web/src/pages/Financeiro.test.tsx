import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Financeiro } from "./Financeiro";

const apiMock = vi.fn();
vi.mock("../lib/session", () => ({
  authedRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe("Financeiro — recebimentos (Stories 5.2/5.3)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("busca recebimentos do período e mostra totais + lista", async () => {
    apiMock.mockResolvedValue(
      jsonRes({
        receipts: [
          {
            appointmentId: "1",
            clientName: "Ana Lima",
            serviceName: "Corte",
            date: "2026-09-10",
            amount: 50,
            method: "pix",
            status: "pago",
          },
          {
            appointmentId: "2",
            clientName: "Bruno",
            serviceName: "Barba",
            date: "2026-09-11",
            amount: 30,
            method: null,
            status: "pendente",
          },
        ],
        totalReceived: 50,
        totalPending: 30,
      }),
    );
    render(<Financeiro />);

    expect(await screen.findByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
    // consulta o endpoint de recebimentos com período
    expect(String(apiMock.mock.calls[0][0])).toContain("/appointments/payments?from=");
    // totais + status ("Pendente" aparece no total E no status → getAllByText)
    expect(screen.getByText("Recebido")).toBeInTheDocument();
    expect(screen.getAllByText("Pendente").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pago")).toBeInTheDocument();
  });

  it("filtro por SITUAÇÃO (pagos) esconde os pendentes na lista", async () => {
    apiMock.mockResolvedValue(
      jsonRes({
        receipts: [
          { appointmentId: "1", clientId: "c1", clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" },
          { appointmentId: "2", clientId: "c2", clientName: "Bruno", serviceName: "Barba", date: "2026-09-11", amount: 30, method: null, status: "pendente" },
        ],
        totalReceived: 50,
        totalPending: 30,
      }),
    );
    render(<Financeiro />);
    await screen.findByText(/Corte/); // "Corte · PIX" (forma anexada)
    // filtra por Pagos → some o pendente (Barba/Bruno), fica o pago (Corte/Ana).
    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "pago" } });
    expect(screen.getByText(/Corte/)).toBeInTheDocument();
    // O serviço "Barba" (do pendente) some da LISTA (Bruno segue no dropdown de cliente).
    expect(screen.queryByText(/Barba/)).toBeNull();
  });

  it("atalho de período (Dia) refaz a busca com from=to (hoje)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ receipts: [], totalReceived: 0, totalPending: 0 }),
    );
    render(<Financeiro />);
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    apiMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Dia" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    const url = String(apiMock.mock.calls[0][0]);
    const m = url.match(/from=([\d-]+)&to=([\d-]+)/);
    expect(m?.[1]).toBe(m?.[2]); // Dia → from = to
  });

  it("estado vazio quando não há recebimentos no período", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ receipts: [], totalReceived: 0, totalPending: 0 }),
    );
    render(<Financeiro />);
    await waitFor(() =>
      expect(
        screen.getByText(/Nenhum recebimento no período/i),
      ).toBeInTheDocument(),
    );
  });
});
