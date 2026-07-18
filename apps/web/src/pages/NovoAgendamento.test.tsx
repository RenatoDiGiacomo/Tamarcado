import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NovoAgendamento } from "./NovoAgendamento";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

// Papel do usuário controlável por teste.
let role: "owner" | "basic" = "owner";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", accessLevel: role } }),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

interface Opts {
  method?: string;
  body?: Record<string, unknown>;
}

const services = [{ id: "s1", name: "Corte", isActive: true }];
const attenders = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Bruna" },
];
const slots = [{ time: "09:00" }, { time: "10:00" }];

function routeApi(path: string, opts: Opts = {}): Response {
  const method = opts.method ?? "GET";
  if (path === "/services") return jsonRes({ services });
  if (path === "/users/attenders") return jsonRes({ users: attenders });
  if (path.startsWith("/availability")) return jsonRes({ slots });
  if (path.startsWith("/clients?search")) {
    return jsonRes({ clients: [{ id: "c1", name: "Maria Souza", phone_whatsapp: null }] });
  }
  if (path === "/clients" && method === "POST") {
    return jsonRes({ id: "c9", name: (opts.body?.name as string) ?? "Nova", phone_whatsapp: null });
  }
  if (path === "/appointments" && method === "POST") {
    return jsonRes({ id: "a1", date: "2026-07-20", overbooked: false });
  }
  return jsonRes({});
}

function setup(role_: "owner" | "basic" = "owner") {
  role = role_;
  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <NovoAgendamento
      open
      onOpenChange={onOpenChange}
      date="2026-07-20"
      onCreated={onCreated}
    />,
  );
  return { onCreated, onOpenChange };
}

describe("NovoAgendamento", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, opts: Opts) =>
      Promise.resolve(routeApi(path, opts)),
    );
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("cria um agendamento: busca cliente, escolhe serviço/horário e envia date+time", async () => {
    const { onCreated } = setup("owner");
    await screen.findByText("Novo agendamento");

    // Busca e seleciona a cliente.
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Maria" } });
    fireEvent.click(await screen.findByRole("button", { name: /Maria Souza/ }));

    // Serviço + horário (slot livre).
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "10:00" })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "10:00" } });

    fireEvent.click(screen.getByRole("button", { name: "Agendar" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("2026-07-20"));
    const post = apiMock.mock.calls.find(
      ([p, o]) => p === "/appointments" && o?.method === "POST",
    );
    expect(post?.[1].body).toEqual({
      client_id: "c1",
      service_id: "s1",
      professional_id: null,
      date: "2026-07-20",
      time: "10:00",
    });
  });

  it("oculta o campo Profissional para basic (D6)", async () => {
    setup("basic");
    await screen.findByText("Novo agendamento");
    expect(screen.getByLabelText("Serviço")).toBeInTheDocument();
    expect(screen.queryByLabelText("Profissional")).toBeNull();
  });

  it("owner vê o campo Profissional", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    expect(screen.getByLabelText("Profissional")).toBeInTheDocument();
  });

  it("cadastra cliente inline e a seleciona (FR-D7)", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");

    fireEvent.click(screen.getByRole("button", { name: /nova cliente/i }));
    fireEvent.change(screen.getByLabelText("Nome da nova cliente"), {
      target: { value: "Carla Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    // Cliente criada vira a selecionada (aparece com botão "trocar").
    expect(await screen.findByText("Carla Nova")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "trocar" })).toBeInTheDocument();
  });

  it("Horário fica desabilitado com dica enquanto não há serviço", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    const time = screen.getByLabelText("Horário") as HTMLSelectElement;
    expect(time).toBeDisabled();
    expect(screen.getByText("Escolha o serviço primeiro")).toBeInTheDocument();
  });

  it("lista os horários livres da disponibilidade ao escolher o serviço", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    // Slots do /availability viram opções; "Outro horário" fica por último.
    expect(await screen.findByRole("option", { name: "09:00" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "10:00" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /outro horário/i })).toBeInTheDocument();
  });

  it("avisa overbooking ao escolher 'outro horário' fora dos slots livres (D1)", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "10:00" })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "__outro__" } });
    fireEvent.change(screen.getByLabelText("Outro horário"), {
      target: { value: "13:30" }, // fora dos slots livres (09/10)
    });
    expect(await screen.findByText(/fora da disponibilidade/i)).toBeInTheDocument();
  });
});
