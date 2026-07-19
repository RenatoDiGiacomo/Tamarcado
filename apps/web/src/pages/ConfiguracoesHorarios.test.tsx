import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfiguracoesHorarios } from "./ConfiguracoesHorarios";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}
interface Opts {
  method?: string;
  body?: Record<string, unknown>;
}

const attenders = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Bruna" },
];
const schedP2 = {
  intervalMinutes: 15,
  days: [{ dayOfWeek: 1, startTime: "09:00:00", endTime: "18:00:00", isActive: true }],
};

function routeApi(path: string, opts: Opts = {}): Response {
  const method = opts.method ?? "GET";
  if (path === "/users/attenders") return jsonRes({ users: attenders });
  if (path === "/schedules/p1" && method === "GET")
    return jsonRes({ intervalMinutes: 0, days: [] }); // Ana: sem horários
  if (path === "/schedules/p2" && method === "GET") return jsonRes(schedP2);
  if (path.startsWith("/schedules/") && method === "PUT")
    return jsonRes({ ...schedP2, professionalId: path.split("/")[2] });
  return jsonRes({});
}

describe("ConfiguracoesHorarios", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, opts: Opts) =>
      Promise.resolve(routeApi(path, opts)),
    );
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("marca quem está 'sem horários' no seletor (AC7)", async () => {
    render(<ConfiguracoesHorarios />);
    expect(
      await screen.findByRole("option", { name: "Ana · sem horários" }),
    ).toBeInTheDocument();
    // Bruna tem horário → sem selo.
    expect(screen.getByRole("option", { name: "Bruna" })).toBeInTheDocument();
  });

  it("salva a semana via PUT com os 7 dias (dia ativado entra is_active)", async () => {
    render(<ConfiguracoesHorarios />);
    await screen.findByRole("option", { name: "Ana · sem horários" });
    // Ana (default) vem sem dias ativos; ativa Segunda.
    fireEvent.click(await screen.findByLabelText("Segunda"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const put = apiMock.mock.calls.find(
      ([p, o]) => p === "/schedules/p1" && o?.method === "PUT",
    );
    expect(put?.[1].body.days).toHaveLength(7);
    const seg = put?.[1].body.days.find(
      (d: { day_of_week: number }) => d.day_of_week === 1,
    );
    expect(seg).toEqual({
      day_of_week: 1,
      start_time: "09:00",
      end_time: "18:00",
      is_active: true,
    });
  });

  it("bloqueia salvar com fim <= início num dia ativo (não chama a API)", async () => {
    render(<ConfiguracoesHorarios />);
    await screen.findByRole("option", { name: "Ana · sem horários" });
    fireEvent.click(await screen.findByLabelText("Segunda"));
    fireEvent.change(screen.getByLabelText("Fim Segunda"), {
      target: { value: "08:00" }, // antes do início (09:00)
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/o horário de fim deve ser após o início/i)).toBeInTheDocument();
    expect(
      apiMock.mock.calls.some(([, o]) => o?.method === "PUT"),
    ).toBe(false);
  });

  it("'Aplicar a todos' grava para cada profissional (após confirmar)", async () => {
    render(<ConfiguracoesHorarios />);
    await screen.findByRole("option", { name: "Ana · sem horários" });
    fireEvent.click(await screen.findByLabelText("Segunda"));

    fireEvent.click(screen.getByRole("button", { name: "Aplicar a todos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const puts = apiMock.mock.calls.filter(([p, o]) => /^\/schedules\//.test(p) && o?.method === "PUT");
    const ids = puts.map(([p]) => p);
    expect(ids).toContain("/schedules/p1");
    expect(ids).toContain("/schedules/p2");
  });
});
