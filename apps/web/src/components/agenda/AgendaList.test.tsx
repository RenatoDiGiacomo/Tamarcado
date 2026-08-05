import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgendaList } from "./AgendaList";
import type { AgendaAppointment } from "./AgendaGrid";

// useMonthAppointments (pontos do calendário) faz um fetch — devolvemos vazio.
const apiMock = vi.fn();
vi.mock("../../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const base: AgendaAppointment = {
  id: "1",
  clientName: "Maria das Dores",
  serviceName: "Corte",
  start: "09:30",
  end: "10:30",
  status: "confirmed",
  origin: "manual",
  professionalName: "Fernanda",
  weekday: 4, // sexta
};
const semProf: AgendaAppointment = {
  id: "2",
  clientName: "João Souza",
  serviceName: "Barba",
  start: "11:00",
  end: "11:30",
  status: "pending",
  origin: "whatsapp",
  professionalName: null,
  weekday: 4,
};

function setup(props: Partial<React.ComponentProps<typeof AgendaList>> = {}) {
  const onSelectDay = vi.fn();
  const onSelectAppointment = vi.fn();
  const onViewChange = vi.fn();
  const onNew = vi.fn();
  render(
    <AgendaList
      anchor="2026-07-25"
      view="dia"
      appointments={[base, semProf]}
      onViewChange={onViewChange}
      onSelectDay={onSelectDay}
      onSelectAppointment={onSelectAppointment}
      onNew={onNew}
      {...props}
    />,
  );
  return { onSelectDay, onSelectAppointment, onViewChange, onNew };
}

describe("AgendaList (agenda mobile em lista)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(jsonRes({ appointments: [] }));
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("mostra o calendário do mês e a lista do dia (não grade)", () => {
    setup();
    expect(screen.getByText("Julho 2026")).toBeInTheDocument();
    expect(screen.getByText("Maria das Dores")).toBeInTheDocument();
    expect(screen.getByText("João Souza")).toBeInTheDocument();
    // profissional e "não atribuído"
    expect(screen.getByText("Fernanda")).toBeInTheDocument();
    expect(screen.getByText("Não atribuído")).toBeInTheDocument();
  });

  it("selecionar um dia no calendário chama onSelectDay com a data", () => {
    const { onSelectDay } = setup();
    fireEvent.click(screen.getByRole("button", { name: "2026-07-10" }));
    expect(onSelectDay).toHaveBeenCalledWith("2026-07-10");
  });

  it("tocar num card abre o detalhe (onSelectAppointment)", () => {
    const { onSelectAppointment } = setup();
    fireEvent.click(screen.getByText("Maria das Dores"));
    expect(onSelectAppointment).toHaveBeenCalledWith("1");
  });

  it("dia sem agendamentos → empty state compacto com atalho de novo", () => {
    const { onNew } = setup({ appointments: [] });
    expect(screen.getByText(/nenhum agendamento neste dia/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /novo agendamento/i }));
    expect(onNew).toHaveBeenCalled();
  });

  it("visão Semana agrupa por dia com cabeçalho de data", () => {
    setup({ view: "semana" });
    // weekday 4 (sexta) da semana de 25/07 → Sex, 24/07
    expect(screen.getByText("Sex, 24/07")).toBeInTheDocument();
    expect(screen.getByText("Maria das Dores")).toBeInTheDocument();
  });

  it("busca os pontos do mês (dias com agendamento) via API", async () => {
    setup();
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/appointments\?from=2026-07-01&to=2026-07-31/),
        expect.anything(),
      ),
    );
  });

  it("colore o dia/ponto do calendário pela cor do status", async () => {
    // Mês com 1 pendente em 10/07 → o dia ganha o ponto na cor do status.
    apiMock.mockResolvedValue(
      jsonRes({
        appointments: [
          {
            id: "9",
            clientName: "X",
            serviceId: "1",
            serviceName: "Corte",
            professionalId: null,
            professionalName: null,
            date: "2026-07-10",
            start: "09:00",
            end: "09:30",
            status: "pending",
            source: "manual",
          },
        ],
      }),
    );
    setup();
    const day = await screen.findByRole("button", { name: "2026-07-10" });
    await waitFor(() =>
      expect(day.querySelector(".bg-status-pending")).toBeTruthy(),
    );
  });
});
