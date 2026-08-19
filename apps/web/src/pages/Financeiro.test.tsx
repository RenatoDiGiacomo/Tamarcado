import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Financeiro } from "./Financeiro";

const apiMock = vi.fn();
vi.mock("../lib/session", () => ({
  authedRequest: (...args: unknown[]) => apiMock(...args),
}));
const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe("Financeiro — recebimentos (Stories 5.2/5.3)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    navigateMock.mockReset();
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

  it("clicar num item abre o PaymentForm; salvar faz PUT e recarrega (DL-065)", async () => {
    apiMock.mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === "PUT") return Promise.resolve(jsonRes({}));
      return Promise.resolve(
        jsonRes({
          receipts: [
            {
              appointmentId: "9",
              clientId: "c1",
              clientName: "Ana Lima",
              serviceName: "Corte",
              date: "2026-09-10",
              amount: 50,
              method: null,
              status: "pendente",
            },
          ],
          totalReceived: 0,
          totalPending: 50,
        }),
      );
    });
    render(<Financeiro />);
    // Abre o registro clicando no recebimento pendente da lista.
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Editar pagamento de Ana Lima/,
      }),
    );
    // O mesmo formulário do agendamento — valor pré-preenchido, situação, forma.
    const valor = (await screen.findByLabelText(
      "Valor recebido",
    )) as HTMLInputElement;
    expect(valor.value).toMatch(/R\$\s*50,00/);
    fireEvent.change(screen.getByLabelText("Situação do pagamento"), {
      target: { value: "pago" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const put = apiMock.mock.calls.find(
        ([, o]) => (o as { method?: string } | undefined)?.method === "PUT",
      );
      expect(put?.[0]).toBe("/appointments/9/payment");
      expect((put?.[1] as { body: Record<string, unknown> }).body).toEqual({
        amount: 50,
        method: undefined,
        status: "pago",
      });
    });
    // Recarrega os recebimentos após salvar (GET além do inicial).
    await waitFor(() => {
      const gets = apiMock.mock.calls.filter(([u]) =>
        String(u).includes("/appointments/payments?from="),
      );
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("clicar no NOME do card leva ao perfil da cliente, sem abrir o pagamento (DL-066)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({
        receipts: [
          { appointmentId: "1", clientId: "c1", clientName: "Ana Lima", serviceName: "Corte", date: "2026-09-10", amount: 50, method: "pix", status: "pago" },
        ],
        totalReceived: 50,
        totalPending: 0,
      }),
    );
    render(<Financeiro />);
    // Nome (exato) = link ao perfil; o card (aria-label "Editar pagamento…") é outro alvo.
    fireEvent.click(await screen.findByRole("button", { name: "Ana Lima" }));
    expect(navigateMock).toHaveBeenCalledWith("/clientes/c1");
    // stopPropagation: NÃO abriu o formulário de pagamento.
    expect(screen.queryByLabelText("Valor recebido")).toBeNull();
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
