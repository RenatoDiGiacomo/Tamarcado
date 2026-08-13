import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
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

// Toast (UX-DR19) — sem Toaster montado no teste.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Agenda passou a ler useLocation (FAB do celular, Épico 7). Sem sessão de
// navegação no teste, devolvemos um location neutro (state null → não abre Novo).
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useLocation: () => ({ state: null, pathname: "/", search: "", hash: "", key: "t" }),
}));

/** Data civil (YYYY-MM-DD) deslocada em `days` a partir de hoje. */
function isoOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const BUSINESS = { start: "08:00", end: "19:00" };

const seg: ApiAppointment = {
  id: "10",
  clientName: "Maria das Dores",
  serviceId: "3",
  serviceName: "Coloração",
  professionalId: "7",
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
  serviceId: "3",
  serviceName: "Corte",
  professionalId: null,
  professionalName: null,
  date: "2026-07-20",
  start: "11:00",
  end: "12:00",
  status: "completed",
  source: "manual",
};

const pendente: ApiAppointment = {
  id: "20",
  clientName: "Bruna Alves",
  serviceId: "3",
  serviceName: "Corte",
  professionalId: null,
  professionalName: null,
  date: isoOffset(2),
  start: "14:00",
  end: "15:00",
  status: "pending",
  source: "link",
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
    // A Agenda escolhe a vista por breakpoint (Épico 7). Estes testes exercitam
    // o DESKTOP (grade) → matchMedia = desktop. A vista mobile (AgendaList) tem
    // testes próprios em AgendaList.test.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
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
    // Origem vira ÍCONE (balão só no WhatsApp), não mais uma linha "Origem" (3.6).
    expect(within(dialog).getByLabelText("WhatsApp")).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("Origem");
    // Status aparece UMA vez (badge no topo, junto ao nome).
    expect(within(dialog).getAllByText("Confirmado")).toHaveLength(1);
    // Botão Editar visível e óbvio (3.6).
    expect(
      within(dialog).getByRole("button", { name: "Editar" }),
    ).toBeInTheDocument();
  });

  it("Editar abre o formulário pré-preenchido e salva via PATCH (Story 3.6)", async () => {
    apiMock.mockImplementation(
      (path: string, opts?: { method?: string }) => {
        if (opts?.method === "PATCH") {
          return Promise.resolve(jsonRes({ appointment: {}, overbooked: false }));
        }
        if (path === "/services") {
          return Promise.resolve(
            jsonRes({
              services: [
                { id: "3", name: "Coloração", isActive: true },
                { id: "9", name: "Corte", isActive: true },
              ],
            }),
          );
        }
        if (path === "/users/attenders") {
          return Promise.resolve(
            jsonRes({ users: [{ id: "7", name: "Fernanda" }] }),
          );
        }
        if (path.startsWith("/availability")) {
          return Promise.resolve(jsonRes({ slots: [{ time: "09:00" }], reason: null }));
        }
        return Promise.resolve(
          jsonRes({ appointments: [seg], businessHours: BUSINESS }),
        );
      },
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));

    // Abre o form em modo edição, cliente fixo e serviço pré-preenchido.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Editar agendamento");
    expect(dialog).toHaveTextContent("Maria das Dores");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Serviço") as HTMLSelectElement).value,
      ).toBe("3"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/appointments/10");
      expect(patch?.[1].body).toEqual(
        expect.objectContaining({ serviceId: "3", date: "2026-07-20", time: "09:00" }),
      );
    });
  });

  it("marca Concluído num agendamento passado → PATCH status {to:completed} + recarrega (Story 3.7)", async () => {
    const past = { ...seg, id: "10", date: isoOffset(-1) }; // ontem, confirmado
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve(jsonRes({ id: "10", status: "completed" }));
      }
      return Promise.resolve(
        jsonRes({ appointments: [past], businessHours: BUSINESS }),
      );
    });
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));
    fireEvent.click(await screen.findByRole("button", { name: "Concluído" }));

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/appointments/10/status");
      expect(patch?.[1].body).toEqual({ to: "completed" });
    });
    // Espera o reload (2º GET), disparado por setState após o PATCH — asseverar
    // síncrono aqui corre com o reload (flaky).
    await waitFor(() => {
      const gets = apiMock.mock.calls.filter(
        ([p, o]) => String(p).startsWith("/appointments?") && o?.method === undefined,
      );
      expect(gets.length).toBeGreaterThanOrEqual(2); // recarrega após marcar
    });
  });

  it("marca Não compareceu → PATCH status {to:no_show}", async () => {
    const past = { ...seg, id: "10", date: isoOffset(-1) };
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve(jsonRes({ id: "10", status: "no_show" }));
      }
      return Promise.resolve(
        jsonRes({ appointments: [past], businessHours: BUSINESS }),
      );
    });
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));
    fireEvent.click(await screen.findByRole("button", { name: "Não compareceu" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[1].body).toEqual({ to: "no_show" });
    });
  });

  it("agendamento FUTURO não oferece Concluído/Não compareceu (D1)", async () => {
    const future = { ...seg, id: "10", date: isoOffset(2) };
    apiMock.mockResolvedValue(
      jsonRes({ appointments: [future], businessHours: BUSINESS }),
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Maria das Dores"));
    const dialog = await screen.findByRole("dialog");
    // Futuro: sem ações de comparecimento; Editar/Cancelar seguem disponíveis.
    expect(within(dialog).queryByRole("button", { name: "Concluído" })).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Não compareceu" }),
    ).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("Confirmar (5B.3/DL-046): pendente vira confirmado direto no detalhe → PATCH :id/confirm + recarrega", async () => {
    apiMock.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve(jsonRes({ id: "20", status: "confirmed" }));
      }
      return Promise.resolve(
        jsonRes({ appointments: [pendente], businessHours: BUSINESS }),
      );
    });
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Bruna Alves"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/appointments/20/confirm");
      expect(patch?.[1].body).toEqual({});
    });
    // Espera o reload (2º GET), disparado por setState após o PATCH — asseverar
    // síncrono aqui corre com o reload (flaky).
    await waitFor(() => {
      const gets = apiMock.mock.calls.filter(
        ([p, o]) => String(p).startsWith("/appointments?") && o?.method === undefined,
      );
      expect(gets.length).toBeGreaterThanOrEqual(2); // recarrega após confirmar
    });
  });

  it("Confirmar não aparece para basic (permissão owner/gerente)", async () => {
    // Nota: o useAuth do teste é owner; aqui só garantimos que confirmado NÃO
    // oferece Confirmar (o botão é exclusivo do status pendente).
    apiMock.mockResolvedValue(
      jsonRes({
        appointments: [{ ...pendente, id: "21", status: "confirmed" }],
        businessHours: BUSINESS,
      }),
    );
    render(<Agenda />);
    fireEvent.click(await screen.findByText("Bruna Alves"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Confirmar" })).toBeNull();
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
    // Recarrega o período após cancelar (2º GET de /appointments). Disparado
    // por setState após o PATCH — esperamos por ele (asseverar síncrono é corrida).
    await waitFor(() => {
      const gets = apiMock.mock.calls.filter(
        ([p, o]) => String(p).startsWith("/appointments?") && o?.method === undefined,
      );
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
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
