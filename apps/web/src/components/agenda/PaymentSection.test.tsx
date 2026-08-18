import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PaymentSection } from "./PaymentSection";
import type { ApiAppointment } from "../../pages/agendaMap";

const apiMock = vi.fn();
vi.mock("../../lib/session", () => ({
  authedRequest: (...args: unknown[]) => apiMock(...args),
}));
const bumpMock = vi.fn();
vi.mock("../../lib/appointmentsSignal", () => ({
  bumpAppointments: () => bumpMock(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function appt(over: Partial<ApiAppointment> = {}): ApiAppointment {
  return {
    id: "10",
    clientName: "Maria",
    serviceId: "3",
    serviceName: "Corte",
    professionalId: "7",
    professionalName: "Ana",
    date: "2026-09-10",
    start: "11:00",
    end: "12:00",
    status: "confirmed",
    source: "manual",
    payment: null,
    ...over,
  };
}

describe("PaymentSection (Story 5.2)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    bumpMock.mockReset();
  });

  it("sem pagamento: mostra o vazio e o botão Registrar", () => {
    render(<PaymentSection appointment={appt()} />);
    expect(screen.getByText("Sem pagamento registrado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar" })).toBeInTheDocument();
  });

  it("registrar (pago, valor, PIX) → PUT /appointments/:id/payment e recarrega", async () => {
    render(<PaymentSection appointment={appt()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    fireEvent.change(screen.getByLabelText("Valor recebido"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), {
      target: { value: "pix" },
    });
    apiMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        "/appointments/10/payment",
        expect.objectContaining({
          method: "PUT",
          body: { amount: 50, method: "pix", status: "pago" },
        }),
      ),
    );
    expect(bumpMock).toHaveBeenCalled();
  });

  it("forma é OPCIONAL: sem selecionar, o body vai sem method", async () => {
    render(<PaymentSection appointment={appt()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    fireEvent.change(screen.getByLabelText("Valor recebido"), {
      target: { value: "80" },
    });
    apiMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    const body = apiMock.mock.calls[0][1].body as Record<string, unknown>;
    expect(body.amount).toBe(80);
    expect(body.status).toBe("pago");
    expect(body.method).toBeUndefined();
  });

  it("valor obrigatório: sem valor não chama a API e mostra erro", async () => {
    render(<PaymentSection appointment={appt()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/Informe o valor recebido/i)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("com pagamento existente: mostra o resumo e o botão Editar", () => {
    render(
      <PaymentSection
        appointment={appt({ payment: { status: "pago", amount: 50, method: "pix" } })}
      />,
    );
    expect(screen.getByText(/Pago/)).toBeInTheDocument();
    expect(screen.getByText(/50,00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });
});
