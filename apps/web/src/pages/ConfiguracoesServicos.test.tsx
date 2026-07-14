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

  it("salva edição com PATCH e sincroniza o vínculo via PUT (AC7/AC8)", async () => {
    render(<ConfiguracoesServicos />);
    await screen.findByText("Corte");
    await waitFor(() =>
      expect((screen.getByLabelText("Nome do serviço") as HTMLInputElement).value).toBe(
        "Corte",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Bruna" }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    const patch = apiMock.mock.calls.find(
      ([p, o]) => p === "/services/a" && o?.method === "PATCH",
    );
    expect(patch?.[1].body).toMatchObject({ name: "Corte", durationMinutes: 45 });

    const put = apiMock.mock.calls.find(
      ([p, o]) => p === "/services/a/professionals" && o?.method === "PUT",
    );
    expect(put?.[1].body.professionalIds).toEqual(
      expect.arrayContaining(["p1", "p2"]),
    );
  });

  it("cria serviço novo via POST (AC7)", async () => {
    render(<ConfiguracoesServicos />);
    await screen.findByText("Corte");

    fireEvent.click(screen.getByRole("button", { name: /novo serviço/i }));
    fireEvent.change(screen.getByLabelText("Nome do serviço"), {
      target: { value: "Escova" },
    });
    fireEvent.change(screen.getByLabelText("Duração (min)"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const post = apiMock.mock.calls.find(
      ([p, o]) => p === "/services" && o?.method === "POST",
    );
    expect(post?.[1].body).toMatchObject({
      name: "Escova",
      durationMinutes: 30,
      price: null,
    });
  });
});
