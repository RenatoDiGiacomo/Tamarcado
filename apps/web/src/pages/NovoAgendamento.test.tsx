import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NovoAgendamento } from "./NovoAgendamento";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

// Papel do usuário controlável por teste.
let role: "owner" | "professional" = "owner";
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

const services = [
  { id: "s1", name: "Corte", isActive: true },
  { id: "s2", name: "Coloração", isActive: true },
];
const attenders = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Bruna" },
];
const slots = [{ time: "09:00" }, { time: "10:00" }];

function routeApi(path: string, opts: Opts = {}): Response {
  const method = opts.method ?? "GET";
  if (path === "/services") return jsonRes({ services });
  if (path === "/users/attenders") return jsonRes({ users: attenders });
  if (path.startsWith("/availability"))
    return jsonRes({ slots, reason: slots.length > 0 ? null : "full" });
  if (path.startsWith("/clients?search")) {
    return jsonRes({ clients: [{ id: "c1", name: "Maria Souza", phone_whatsapp: null }] });
  }
  if (path === "/clients" && method === "POST") {
    return jsonRes({ id: "c9", name: (opts.body?.name as string) ?? "Nova", phone_whatsapp: null });
  }
  if (path === "/appointments" && method === "POST") {
    return jsonRes({ id: "a1", date: "2026-07-20", overbooked: false });
  }
  if (path.startsWith("/appointments/") && method === "PATCH") {
    return jsonRes({ appointment: {}, overbooked: false });
  }
  return jsonRes({});
}

function setup(role_: "owner" | "professional" = "owner") {
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

    // Serviço + horário (chip do slot livre).
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));

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

  it("modo edição (3.6): pré-preenche, troca Corte→Coloração e salva via PATCH", async () => {
    role = "owner";
    const onCreated = vi.fn();
    render(
      <NovoAgendamento
        open
        onOpenChange={vi.fn()}
        date="2026-07-20"
        onCreated={onCreated}
        editing={{
          appointmentId: "42",
          clientName: "Maria Souza",
          serviceId: "s1",
          professionalId: "p1",
          date: "2026-07-20",
          time: "10:00",
        }}
      />,
    );
    await screen.findByText("Editar agendamento");
    // Cliente fixo (sem "trocar") e serviço pré-preenchido.
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "trocar" })).toBeNull();
    await waitFor(() =>
      expect((screen.getByLabelText("Serviço") as HTMLSelectElement).value).toBe("s1"),
    );

    // Troca o serviço → Coloração (reabre disponibilidade); re-escolhe o horário.
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s2" } });
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(
        ([p, o]) => p === "/appointments/42" && o?.method === "PATCH",
      );
      expect(patch?.[1].body).toEqual(
        expect.objectContaining({
          serviceId: "s2",
          date: "2026-07-20",
          time: "10:00",
          professionalId: "p1",
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith("2026-07-20");
  });

  it("mostra a mensagem REAL da API quando a criação falha (não a genérica)", async () => {
    apiMock.mockImplementation((path: string, opts: Opts) => {
      if (path === "/appointments" && opts.method === "POST") {
        return Promise.resolve(
          jsonRes(
            { message: "A data deve ser hoje ou futura.", statusCode: 400 },
            false,
          ),
        );
      }
      return Promise.resolve(routeApi(path, opts));
    });
    setup("owner");
    await screen.findByText("Novo agendamento");
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Maria" } });
    fireEvent.click(await screen.findByRole("button", { name: /Maria Souza/ }));
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Agendar" }));

    expect(
      await screen.findByText("A data deve ser hoje ou futura."),
    ).toBeInTheDocument();
  });

  it("oculta o campo Profissional para Profissional sem o flag (D6)", async () => {
    setup("professional");
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

  it("sem serviço, o Horário mostra a dica (não um campo vazio)", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    expect(screen.getByText("Escolha o serviço primeiro.")).toBeInTheDocument();
    // Sem serviço, não há chips de horário.
    expect(screen.queryByRole("button", { name: "09:00" })).toBeNull();
  });

  it("mostra os horários livres como CHIPS clicáveis ao escolher o serviço", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    await screen.findByRole("option", { name: "Corte" }); // espera o /services carregar
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    // Slots viram botões (chips) visíveis; "Outro horário" fica discreto abaixo.
    expect(await screen.findByRole("button", { name: "09:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /outro horário/i })).toBeInTheDocument();
  });

  it("mensagem diferenciada por motivo quando não há horários (day_off)", async () => {
    apiMock.mockImplementation((path: string, opts: Opts) => {
      if (path.startsWith("/availability"))
        return Promise.resolve(jsonRes({ slots: [], reason: "day_off" }));
      return Promise.resolve(routeApi(path, opts));
    });
    setup("owner");
    await screen.findByText("Novo agendamento");
    await screen.findByRole("option", { name: "Corte" }); // espera o /services carregar
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    expect(
      await screen.findByText("Não há atendimento neste dia."),
    ).toBeInTheDocument();
  });

  it("avisa overbooking ao usar 'Outro horário' fora dos slots livres (D1)", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    await screen.findByRole("option", { name: "Corte" }); // espera o /services carregar
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    await screen.findByRole("button", { name: "10:00" });

    fireEvent.click(screen.getByRole("button", { name: /outro horário/i }));
    fireEvent.change(screen.getByLabelText("Outro horário"), {
      target: { value: "13:30" }, // fora dos slots livres (09/10)
    });
    expect(await screen.findByText(/fora da disponibilidade/i)).toBeInTheDocument();
  });

  it("com profissional escolhido, o aviso NOMEIA quem já está ocupado (dentro do expediente)", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    await screen.findByRole("option", { name: "Corte" });
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Profissional"), { target: { value: "p1" } }); // Ana
    await screen.findByRole("button", { name: "10:00" });

    fireEvent.click(screen.getByRole("button", { name: /outro horário/i }));
    // 09:30 cai DENTRO da janela dela (09:00–10:00) mas não é um slot livre →
    // ela já está atendendo ali (dois lugares ao mesmo tempo).
    fireEvent.change(screen.getByLabelText("Outro horário"), { target: { value: "09:30" } });
    expect(
      await screen.findByText(/Ana já tem atendimento neste horário/i),
    ).toBeInTheDocument();
  });

  it("profissional escolhido mas horário APÓS o expediente → aviso genérico (não é conflito)", async () => {
    setup("owner");
    await screen.findByText("Novo agendamento");
    await screen.findByRole("option", { name: "Corte" });
    fireEvent.change(screen.getByLabelText("Serviço"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Profissional"), { target: { value: "p1" } }); // Ana
    await screen.findByRole("button", { name: "10:00" });

    fireEvent.click(screen.getByRole("button", { name: /outro horário/i }));
    // 20:00 está DEPOIS do último slot (10:00): encaixe fora da faixa, sem
    // conflito com outro atendimento → não nomeia, cai no genérico.
    fireEvent.change(screen.getByLabelText("Outro horário"), { target: { value: "20:00" } });
    expect(await screen.findByText(/fora da disponibilidade/i)).toBeInTheDocument();
    expect(screen.queryByText(/já tem atendimento/i)).toBeNull();
  });
});
