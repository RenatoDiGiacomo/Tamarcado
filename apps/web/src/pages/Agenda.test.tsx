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

// Toast de sucesso (UX-DR19) — sem Toaster montado no teste.
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

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

  it("estende a grade para cobrir agendamento após o fechamento (não some)", async () => {
    // Salão fecha 19:00, mas há um encaixe às 20:00 → a grade tem que ir além.
    apiMock.mockResolvedValue(
      jsonRes({
        appointments: [{ ...seg, id: "z", start: "20:00", end: "20:15" }],
        businessHours: BUSINESS, // 08:00–19:00
      }),
    );
    render(<Agenda />);
    // O rótulo de hora "20:00" na trilha só existe se a grade foi estendida.
    expect(await screen.findByText("20:00")).toBeInTheDocument();
  });

  it("cancela um agendamento: confirmação + motivo → PATCH e recarrega (Story 3.4)", async () => {
    apiMock.mockImplementation(
      (path: string, opts?: { method?: string; body?: unknown }) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve(jsonRes({ id: "10", status: "cancelled" }));
        }
        return Promise.resolve(
          jsonRes({ appointments: [seg], businessHours: BUSINESS }),
        );
      },
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores")); // abre o detalhe

    // Detalhe → confirmação destrutiva.
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar agendamento" }),
    );
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), {
      target: { value: "Cliente remarcou" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar cancelamento" }),
    );

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/appointments/10/cancel");
      expect(patch?.[1].body).toEqual({ reason: "Cliente remarcou" });
    });
    // Recarrega o período após cancelar (≥2 GETs de /appointments).
    const gets = apiMock.mock.calls.filter(
      ([p, o]) => String(p).startsWith("/appointments?") && o?.method === undefined,
    );
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it("motivo é opcional: confirma sem preencher → body sem reason", async () => {
    apiMock.mockImplementation(
      (path: string, opts?: { method?: string }) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve(jsonRes({ id: "10", status: "cancelled" }));
        }
        return Promise.resolve(
          jsonRes({ appointments: [seg], businessHours: BUSINESS }),
        );
      },
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar agendamento" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[1].body).toEqual({});
    });
  });

  it("não oferece cancelar para status não-cancelável (concluído)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({
        appointments: [{ ...seg, status: "completed" }],
        businessHours: BUSINESS,
      }),
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));
    await screen.findByRole("dialog");
    expect(
      screen.queryByRole("button", { name: "Cancelar agendamento" }),
    ).toBeNull();
  });

  it("mostra a mensagem REAL da API quando o cancelamento falha", async () => {
    apiMock.mockImplementation(
      (path: string, opts?: { method?: string }) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve(
            jsonRes(
              { message: "Não é possível cancelar um atendimento já encerrado.", statusCode: 400 },
              false,
            ),
          );
        }
        return Promise.resolve(
          jsonRes({ appointments: [seg], businessHours: BUSINESS }),
        );
      },
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar agendamento" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar cancelamento" }),
    );
    expect(
      await screen.findByText(
        "Não é possível cancelar um atendimento já encerrado.",
      ),
    ).toBeInTheDocument();
  });
});
