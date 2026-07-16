import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfiguracoesServicos } from "./ConfiguracoesServicos";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

// Respostas do GET vêm em camelCase (contrato da API); o BODY enviado nas
// mutações usa snake_case (duration_minutes) — é o que o DTO valida.
const svcA = {
  id: "a",
  name: "Corte",
  durationMinutes: 45,
  price: 80,
  isActive: true,
};
const svcB = {
  id: "b",
  name: "Coloração",
  durationMinutes: 180,
  price: 250,
  isActive: true,
};

interface Opts {
  method?: string;
  body?: unknown;
}

function routeApi(path: string, opts: Opts = {}): Response {
  const method = opts.method ?? "GET";
  if (path === "/services" && method === "GET") {
    return jsonRes({ services: [svcA, svcB] });
  }
  if (path === "/users/attenders") {
    return jsonRes({ users: [{ id: "p1", name: "Ana" }, { id: "p2", name: "Bruna" }] });
  }
  if (path === "/services/a/professionals" && method === "GET") {
    return jsonRes({ professionalIds: ["p1"] });
  }
  if (path === "/services/a/professionals" && method === "PUT") {
    return jsonRes({ professionalIds: (opts.body as { professionalIds: string[] }).professionalIds });
  }
  if (path === "/services/a" && method === "PATCH") {
    return jsonRes(svcA);
  }
  if (path === "/services" && method === "POST") {
    return jsonRes({ ...svcA, id: "c", name: "Escova", durationMinutes: 30, price: null });
  }
  if (path === "/services/c/professionals") {
    return jsonRes({ professionalIds: [] });
  }
  return jsonRes({}, true);
}

describe("ConfiguracoesServicos", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, opts: Opts) =>
      Promise.resolve(routeApi(path, opts)),
    );
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("lista serviços, seleciona o primeiro e carrega o vínculo (AC6/AC8)", async () => {
    render(<ConfiguracoesServicos />);

    // lista
    expect(await screen.findByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("Coloração")).toBeInTheDocument();

    // formulário prefilled com o primeiro serviço
    await waitFor(() =>
      expect((screen.getByLabelText("Nome do serviço") as HTMLInputElement).value).toBe(
        "Corte",
      ),
    );

    // chip do profissional vinculado (p1 = Ana) marcado
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ana" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: "Bruna" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("rótulo do botão: 'Alterar' num serviço existente, 'Salvar' em novo", async () => {
    render(<ConfiguracoesServicos />);
    // Primeiro serviço fica selecionado ao carregar → edição.
    await waitFor(() =>
      expect((screen.getByLabelText("Nome do serviço") as HTMLInputElement).value).toBe(
        "Corte",
      ),
    );
    expect(screen.getByRole("button", { name: /alterar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^salvar$/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /novo serviço/i }));
    expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /alterar/i })).toBeNull();
  });

  it("'Novo serviço' limpa o formulário mesmo com um serviço selecionado antes", async () => {
    render(<ConfiguracoesServicos />);
    // Chega selecionado no "Corte" (preenchido).
    await waitFor(() =>
      expect((screen.getByLabelText("Nome do serviço") as HTMLInputElement).value).toBe(
        "Corte",
      ),
    );
    expect((screen.getByLabelText("Duração (min)") as HTMLInputElement).value).toBe("45");
    // Ana (p1) vem marcada no Corte.
    expect(screen.getByRole("button", { name: "Ana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /novo serviço/i }));

    // Campos zerados e vínculo limpo → modo criação de fato.
    expect((screen.getByLabelText("Nome do serviço") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Duração (min)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/preço/i) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Ana" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();
  });

  it("salva edição com PATCH em snake_case e sincroniza o vínculo via PUT (AC7/AC8)", async () => {
    render(<ConfiguracoesServicos />);
    await screen.findByText("Corte");
    await waitFor(() =>
      expect((screen.getByLabelText("Nome do serviço") as HTMLInputElement).value).toBe(
        "Corte",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Bruna" }));
    // Serviço existente selecionado → o botão de submit vira "Alterar".
    fireEvent.click(screen.getByRole("button", { name: /alterar/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    const patch = apiMock.mock.calls.find(
      ([p, o]) => p === "/services/a" && o?.method === "PATCH",
    );
    // Contrato da API: duration_minutes (não durationMinutes) e preço numérico.
    expect(patch?.[1].body).toEqual({
      name: "Corte",
      duration_minutes: 45,
      price: 80,
    });

    const put = apiMock.mock.calls.find(
      ([p, o]) => p === "/services/a/professionals" && o?.method === "PUT",
    );
    expect(put?.[1].body.professionalIds).toEqual(
      expect.arrayContaining(["p1", "p2"]),
    );

    // "Alterar" NUNCA cria: nenhum POST /services disparado (sem duplicar).
    expect(
      apiMock.mock.calls.some(([p, o]) => p === "/services" && o?.method === "POST"),
    ).toBe(false);
  });

  it("cria serviço via POST em snake_case, com preço mascarado convertido a decimal (AC7)", async () => {
    render(<ConfiguracoesServicos />);
    await screen.findByText("Corte");

    fireEvent.click(screen.getByRole("button", { name: /novo serviço/i }));
    fireEvent.change(screen.getByLabelText("Nome do serviço"), {
      target: { value: "Escova" },
    });
    fireEvent.change(screen.getByLabelText("Duração (min)"), {
      target: { value: "30" },
    });
    // Máscara de moeda: usuário digita "8050" → 80,50 exibido → 80.5 enviado.
    fireEvent.change(screen.getByLabelText(/preço/i), {
      target: { value: "8050" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    const post = apiMock.mock.calls.find(
      ([p, o]) => p === "/services" && o?.method === "POST",
    );
    // Nomes snake_case, duração INTEIRA, preço DECIMAL (não string com máscara).
    expect(post?.[1].body).toEqual({
      name: "Escova",
      duration_minutes: 30,
      price: 80.5,
    });
    expect(typeof post?.[1].body.duration_minutes).toBe("number");
    expect(Number.isInteger(post?.[1].body.duration_minutes)).toBe(true);

    // "Salvar" NUNCA edita: nenhum PATCH disparado.
    expect(apiMock.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
  });

  it("preço vazio vira null, não '' nem 0 (opcional — DL-030)", async () => {
    render(<ConfiguracoesServicos />);
    await screen.findByText("Corte");

    fireEvent.click(screen.getByRole("button", { name: /novo serviço/i }));
    fireEvent.change(screen.getByLabelText("Nome do serviço"), {
      target: { value: "Escova" },
    });
    fireEvent.change(screen.getByLabelText("Duração (min)"), {
      target: { value: "30" },
    });
    // preço deixado em branco
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const post = apiMock.mock.calls.find(
      ([p, o]) => p === "/services" && o?.method === "POST",
    );
    expect(post?.[1].body.price).toBeNull();
  });

  it("cria o serviço (POST) ANTES de vincular (PUT); não manda profissionais no POST", async () => {
    render(<ConfiguracoesServicos />);
    await screen.findByText("Corte");

    fireEvent.click(screen.getByRole("button", { name: /novo serviço/i }));
    fireEvent.change(screen.getByLabelText("Nome do serviço"), {
      target: { value: "Escova" },
    });
    fireEvent.change(screen.getByLabelText("Duração (min)"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ana" })); // vincula um prof
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    const postIndex = apiMock.mock.calls.findIndex(
      ([p, o]) => p === "/services" && o?.method === "POST",
    );
    const putIndex = apiMock.mock.calls.findIndex(
      ([p, o]) => p === "/services/c/professionals" && o?.method === "PUT",
    );
    expect(postIndex).toBeGreaterThanOrEqual(0);
    expect(putIndex).toBeGreaterThan(postIndex); // vínculo só depois de criar

    // O POST não carrega os profissionais (senão a API rejeita com 400).
    const postBody = apiMock.mock.calls[postIndex][1].body as Record<string, unknown>;
    expect(postBody).not.toHaveProperty("professionalIds");
    // O PUT usa o id retornado pelo POST (c) com o profissional escolhido.
    const putBody = apiMock.mock.calls[putIndex][1].body as {
      professionalIds: string[];
    };
    expect(putBody.professionalIds).toEqual(["p1"]);
  });

  it("bloqueia salvar com duração inválida e mostra mensagem clara (não chama a API)", async () => {
    render(<ConfiguracoesServicos />);
    await screen.findByText("Corte");

    fireEvent.click(screen.getByRole("button", { name: /novo serviço/i }));
    fireEvent.change(screen.getByLabelText("Nome do serviço"), {
      target: { value: "Escova" },
    });
    // duração deixada em branco → inválida
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    // Mensagem específica, não o "Erro ao salvar" genérico.
    expect(await screen.findByText(/duração em minutos maior que zero/i)).toBeInTheDocument();
    // Nenhum POST disparado (validação barrou antes da rede).
    expect(
      apiMock.mock.calls.some(([p, o]) => p === "/services" && o?.method === "POST"),
    ).toBe(false);
  });
});
