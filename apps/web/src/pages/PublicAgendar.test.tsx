import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PublicAgendar } from "./PublicAgendar";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/agendar/:slug" element={<PublicAgendar />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Router padrão do salão-a (branding + 1 serviço + slots + POST ok). */
function route(over: { postOk?: boolean; postBody?: unknown } = {}) {
  const { postOk = true, postBody = { id: "1", status: "pending" } } = over;
  return (path?: string, opts?: { method?: string }) => {
    if (opts?.method === "POST") return Promise.resolve(jsonRes(postBody, postOk));
    if (path === "/public/salao-a/installation")
      return Promise.resolve(jsonRes({ name: "Salão A", logoUrl: null, primaryColor: "#B85C38" }));
    if (path === "/public/salao-a/services")
      return Promise.resolve(
        jsonRes({ services: [{ id: "3", name: "Corte", durationMinutes: 60, price: "50.00" }] }),
      );
    if (path === "/public/salao-a/professionals")
      return Promise.resolve(jsonRes({ professionals: [] }));
    if (path && path.startsWith("/public/salao-a/availability"))
      return Promise.resolve(jsonRes({ slots: [{ time: "10:00" }, { time: "11:00" }], reason: null }));
    return Promise.resolve(jsonRes({}));
  };
}

describe("PublicAgendar (link público)", () => {
  beforeEach(() => apiMock.mockReset());

  it("mostra branding + serviços e texto neutro (5B.1)", async () => {
    apiMock.mockImplementation(route());
    renderAt("/agendar/salao-a");
    expect(await screen.findByText("Salão A")).toBeInTheDocument();
    expect(screen.getByText("Agende seu horário")).toBeInTheDocument();
    expect(screen.getByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("R$ 50,00")).toBeInTheDocument();
    expect(
      screen.getByText(/o estabelecimento confirma o seu horário/i),
    ).toBeInTheDocument();
  });

  it("aplica a cor primária na variável CSS", async () => {
    apiMock.mockImplementation((path?: string) => {
      if (path && path.endsWith("/installation"))
        return Promise.resolve(jsonRes({ name: "X", logoUrl: null, primaryColor: "#6C63FF" }));
      return Promise.resolve(jsonRes({ services: [], professionals: [], slots: [] }));
    });
    renderAt("/agendar/salao-x");
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--primary")).toBe("243 100% 69%"),
    );
  });

  it("slug inexistente (404) → não encontrado", async () => {
    apiMock.mockResolvedValue(jsonRes({}, false));
    renderAt("/agendar/nao-existe");
    expect(await screen.findByText(/estabelecimento não encontrado/i)).toBeInTheDocument();
  });

  it("preenche o formulário e envia → POST com o corpo certo → sucesso (5B.2)", async () => {
    apiMock.mockImplementation(route());
    renderAt("/agendar/salao-a");

    fireEvent.click(await screen.findByText("Corte")); // escolhe serviço → revela o resto
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText("Seu nome"), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "(11) 99999-8888" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Agendar" }));

    await waitFor(() => {
      const postCall = apiMock.mock.calls.find(([, o]) => o?.method === "POST");
      expect(postCall?.[0]).toBe("/public/salao-a/appointments");
      expect(postCall?.[1].body).toEqual(
        expect.objectContaining({
          name: "Maria Silva",
          phone: "11999998888", // máscara removida no front
          serviceId: "3",
          time: "10:00",
          consent: true,
          website: "",
        }),
      );
    });
    expect(await screen.findByText("Recebido!")).toBeInTheDocument();
    expect(
      screen.getByText(/o estabelecimento vai confirmar o seu horário/i),
    ).toBeInTheDocument();
  });

  it("mostra a mensagem REAL da API quando o POST falha (ex.: 2h)", async () => {
    apiMock.mockImplementation(
      route({
        postOk: false,
        postBody: {
          message:
            "Você já tem uma solicitação recente. Aguarde o contato do estabelecimento.",
          statusCode: 429,
        },
      }),
    );
    renderAt("/agendar/salao-a");
    fireEvent.click(await screen.findByText("Corte"));
    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.change(screen.getByLabelText("Seu nome"), { target: { value: "Maria Silva" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "11999998888" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Agendar" }));

    expect(await screen.findByText(/solicitação recente/i)).toBeInTheDocument();
  });

  // ── Ordem do fluxo: serviço → profissional → data → horário ──────────────
  // Antes, Profissional vinha DEPOIS de Horário: escolher a profissional
  // recarregava os horários e a seleção era descartada em silêncio.

  /** Router com duas profissionais e disponibilidade DIFERENTE para cada uma. */
  function routeComProfissionais() {
    return (path?: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") return Promise.resolve(jsonRes({ id: "1", status: "pending" }));
      if (path === "/public/salao-a/installation")
        return Promise.resolve(jsonRes({ name: "Salão A", logoUrl: null, primaryColor: "#B85C38" }));
      if (path === "/public/salao-a/services")
        return Promise.resolve(
          jsonRes({ services: [{ id: "3", name: "Corte", durationMinutes: 60, price: "50.00" }] }),
        );
      if (path === "/public/salao-a/professionals")
        return Promise.resolve(
          jsonRes({ professionals: [{ id: "p1", name: "Ana Souza" }, { id: "p2", name: "Bia Melo" }] }),
        );
      if (path && path.startsWith("/public/salao-a/availability")) {
        // Ana atende 10:00 e 11:00; Bia só 11:00. Sem preferência: as duas.
        if (path.includes("professionalId=p1"))
          return Promise.resolve(jsonRes({ slots: [{ time: "10:00" }, { time: "11:00" }] }));
        if (path.includes("professionalId=p2"))
          return Promise.resolve(jsonRes({ slots: [{ time: "11:00" }] }));
        return Promise.resolve(jsonRes({ slots: [{ time: "10:00" }, { time: "11:00" }] }));
      }
      return Promise.resolve(jsonRes({}));
    };
  }

  async function escolherServico() {
    fireEvent.click(await screen.findByText("Corte"));
  }

  it("as etapas aparecem na ordem: serviço, profissional, dia, horário, dados", async () => {
    apiMock.mockImplementation(routeComProfissionais());
    renderAt("/agendar/salao-a");
    await escolherServico();

    const titulos = await screen.findAllByRole("heading", { level: 2 });
    expect(titulos.map((e) => e.textContent)).toEqual([
      "Escolha o serviço",
      "Com quem você quer ser atendida?",
      "Escolha o dia",
      "Escolha o horário",
      "Seus dados",
    ]);
  });

  it("escolher a profissional DEPOIS do horário mantém o horário, se continuar livre", async () => {
    apiMock.mockImplementation(routeComProfissionais());
    renderAt("/agendar/salao-a");
    await escolherServico();

    fireEvent.click(await screen.findByRole("button", { name: "11:00" }));
    expect(screen.getByRole("button", { name: "11:00" })).toHaveClass("bg-primary");

    // Bia também atende 11:00 → a seleção sobrevive.
    fireEvent.click(screen.getByRole("button", { name: "Bia Melo" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "11:00" })).toHaveClass("bg-primary"),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("se o horário não existir para a profissional nova, AVISA em vez de apagar em silêncio", async () => {
    apiMock.mockImplementation(routeComProfissionais());
    renderAt("/agendar/salao-a");
    await escolherServico();

    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    // Bia não atende 10:00.
    fireEvent.click(screen.getByRole("button", { name: "Bia Melo" }));

    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent("10:00");
    expect(aviso).toHaveTextContent("Bia Melo");
    // E o horário some da seleção, porque de fato não está disponível.
    expect(screen.queryByRole("button", { name: "10:00" })).not.toBeInTheDocument();
  });

  it("escolher um horário novo limpa o aviso", async () => {
    apiMock.mockImplementation(routeComProfissionais());
    renderAt("/agendar/salao-a");
    await escolherServico();

    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Bia Melo" }));
    await screen.findByRole("status");

    fireEvent.click(screen.getByRole("button", { name: "11:00" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("trocar o DIA com horário que some avisa citando a data, não a profissional", async () => {
    // Hoje tem 10:00; amanhã, não.
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const isoAmanha = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}`;

    apiMock.mockImplementation((path?: string, opts?: { method?: string }) => {
      if (path && path.startsWith("/public/salao-a/availability")) {
        if (path.includes(`date=${isoAmanha}`))
          return Promise.resolve(jsonRes({ slots: [{ time: "15:00" }] }));
        return Promise.resolve(jsonRes({ slots: [{ time: "10:00" }, { time: "11:00" }] }));
      }
      return routeComProfissionais()(path, opts);
    });
    renderAt("/agendar/salao-a");
    await escolherServico();

    fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
    // Segundo card da faixa de dias = amanhã.
    const faixaDeDias = screen.getByRole("group", { name: "Dia" });
    fireEvent.click(within(faixaDeDias).getAllByRole("button")[1]);

    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent(/nesta data/i);
    expect(aviso).not.toHaveTextContent(/Ana|Bia/);
  });

  it("horários vêm agrupados por período, e período vazio não aparece", async () => {
    apiMock.mockImplementation((path?: string, opts?: { method?: string }) => {
      if (path && path.startsWith("/public/salao-a/availability"))
        return Promise.resolve(jsonRes({ slots: [{ time: "09:00" }, { time: "14:00" }] }));
      return routeComProfissionais()(path, opts);
    });
    renderAt("/agendar/salao-a");
    await escolherServico();

    expect(await screen.findByText("Manhã")).toBeInTheDocument();
    expect(screen.getByText("Tarde")).toBeInTheDocument();
    expect(screen.queryByText("Noite")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Horários da manhã" })).getByRole("button", {
        name: "09:00",
      }),
    ).toBeInTheDocument();
  });

  it("o resumo mostra o que foi escolhido antes de enviar", async () => {
    apiMock.mockImplementation(routeComProfissionais());
    renderAt("/agendar/salao-a");
    await escolherServico();

    // Sem horário escolhido, o resumo convida a escolher.
    expect(screen.getByText(/para ver o resumo aqui/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    fireEvent.click(await screen.findByRole("button", { name: "11:00" }));

    // Serviço, horário e preço também aparecem nos cards — a asserção olha
    // DENTRO do resumo, senão encontra os dois e falha por ambiguidade.
    const resumo = within(screen.getByRole("group", { name: "Resumo do agendamento" }));
    expect(resumo.getByText("Corte")).toBeInTheDocument();
    expect(resumo.getByText("Ana Souza")).toBeInTheDocument();
    expect(resumo.getByText(/11:00/)).toBeInTheDocument();
    expect(resumo.getByText("R$ 50,00")).toBeInTheDocument();
  });

  it("capa mostra endereço, Como chegar e as redes — e omite o que não existe", async () => {
    apiMock.mockImplementation((path?: string, opts?: { method?: string }) => {
      if (path === "/public/salao-a/installation")
        return Promise.resolve(
          jsonRes({
            name: "Salão A",
            logoUrl: null,
            primaryColor: "#B85C38",
            address: "Rua das Acácias, 210 — Vila Mariana",
            mapsUrl: "https://maps.example/salao-a",
            instagramUrl: "https://instagram.com/salaoa",
            whatsappPhone: null, // não cadastrado → o botão não aparece
          }),
        );
      return routeComProfissionais()(path, opts);
    });
    renderAt("/agendar/salao-a");

    expect(await screen.findByText(/Rua das Acácias, 210/)).toBeInTheDocument();
    const comoChegar = screen.getByRole("link", { name: /como chegar/i });
    expect(comoChegar).toHaveAttribute("href", "https://maps.example/salao-a");
    expect(comoChegar).toHaveAttribute("target", "_blank");
    expect(comoChegar).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /instagram de salão a/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /whatsapp de/i })).not.toBeInTheDocument();
  });

  it("descrição do serviço aparece no card quando existe", async () => {
    apiMock.mockImplementation((path?: string, opts?: { method?: string }) => {
      if (path === "/public/salao-a/services")
        return Promise.resolve(
          jsonRes({
            services: [
              {
                id: "3",
                name: "Corte",
                durationMinutes: 60,
                price: "50.00",
                description: "Inclui lavagem e finalização.",
              },
              { id: "4", name: "Escova", durationMinutes: 45, price: "40.00", description: null },
            ],
          }),
        );
      return routeComProfissionais()(path, opts);
    });
    renderAt("/agendar/salao-a");

    expect(await screen.findByText("Inclui lavagem e finalização.")).toBeInTheDocument();
    // Sem descrição, o card fica compacto — nada de espaço vazio.
    expect(screen.getByText("Escova")).toBeInTheDocument();
  });
});
