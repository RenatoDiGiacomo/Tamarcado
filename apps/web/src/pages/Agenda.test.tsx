import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Agenda } from "./Agenda";
import type { ApiAppointment } from "./agendaMap";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

// A Agenda renderiza o modal NovoAgendamento, que consome useAuth.
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", accessLevel: "owner" } }),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const BUSINESS = { start: "08:00", end: "19:00" };

const seg: ApiAppointment = {
  id: "10",
  clientName: "Maria das Dores",
  serviceName: "Coloração",
  professionalName: "Fernanda",
  date: "2026-07-20",
  start: "09:00",
  end: "10:00",
  status: "confirmed",
  source: "whatsapp",
};
const semAtrib: ApiAppointment = {
  id: "11",
  clientName: "Joana Silva",
  serviceName: "Corte",
  professionalName: null,
  date: "2026-07-20",
  start: "11:00",
  end: "12:00",
  status: "completed",
  source: "manual",
};

/** Captura o último `from`/`to` pedido à API para asserção de período. */
function lastQuery(): string {
  const call = apiMock.mock.calls.at(-1);
  return String(call?.[0] ?? "");
}

describe("Agenda", () => {
  beforeEach(() => {
    apiMock.mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("carrega e renderiza os agendamentos do período com nomes e status", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ appointments: [seg, semAtrib], businessHours: BUSINESS }),
    );
    render(<Agenda />);

    expect(await screen.findByText("Maria das Dores")).toBeInTheDocument();
    expect(screen.getByText("Joana Silva")).toBeInTheDocument();
    // completed → StatusChip "Concluído"; sem profissional → "Não atribuído".
    expect(screen.getAllByText("Concluído").length).toBeGreaterThan(0);
    expect(screen.getByText("Não atribuído")).toBeInTheDocument();
    // origem: balão (WhatsApp) e lápis (manual).
    expect(screen.getByLabelText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByLabelText("Manual")).toBeInTheDocument();
  });

  it("mostra o empty state quando o período não tem agendamentos (AC6)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ appointments: [], businessHours: BUSINESS }),
    );
    render(<Agenda />);
    expect(
      await screen.findByText(/nenhum agendamento neste dia/i),
    ).toBeInTheDocument();
  });

  it("busca 1 dia na visão Dia e 7 dias (seg–dom) ao trocar para Semana (D6)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ appointments: [seg], businessHours: BUSINESS }),
    );
    render(<Agenda />);
    await screen.findByText("Maria das Dores");

    // Visão inicial = dia: from=to.
    const first = lastQuery();
    const m = first.match(/from=([\d-]+)&to=([\d-]+)/);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe(m?.[2]);

    // Troca para Semana → período de 7 dias (from segunda, to domingo).
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    await waitFor(() => {
      const q = lastQuery().match(/from=([\d-]+)&to=([\d-]+)/);
      expect(q?.[1]).not.toBe(q?.[2]);
    });
  });

  it("abre o detalhe read-only ao clicar num agendamento (D3)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ appointments: [seg], businessHours: BUSINESS }),
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Coloração"); // serviço
    expect(dialog).toHaveTextContent("Fernanda"); // profissional
    expect(dialog).toHaveTextContent("WhatsApp"); // origem
  });

  it("mostra erro quando a API falha", async () => {
    apiMock.mockResolvedValue(jsonRes({}, false));
    render(<Agenda />);
    expect(
      await screen.findByText(/não foi possível carregar a agenda/i),
    ).toBeInTheDocument();
  });
});
