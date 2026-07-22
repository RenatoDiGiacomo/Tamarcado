import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Clientes } from "./Clientes";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

interface Opts {
  method?: string;
  body?: Record<string, unknown>;
}

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const sample = [
  { id: "1", name: "Ana Lima", phone_whatsapp: "+5511990000001" },
  { id: "2", name: "Bruno Alves", phone_whatsapp: null },
];
const listRes = (clients = sample, total = clients.length) =>
  jsonRes({ clients, total, page: 1, pageSize: 20 });

function lastGet(): string {
  const call = apiMock.mock.calls
    .filter(([, o]) => (o as Opts | undefined)?.method === undefined)
    .at(-1);
  return String(call?.[0] ?? "");
}

describe("Clientes", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((_path: string, opts?: Opts) => {
      if (opts?.method === "POST") {
        return Promise.resolve(
          jsonRes({ id: "9", name: opts.body?.name ?? "Nova", phone_whatsapp: null }),
        );
      }
      if (opts?.method === "PATCH") {
        return Promise.resolve(
          jsonRes({ id: "1", name: opts.body?.name ?? "Ana", phone_whatsapp: null }),
        );
      }
      return Promise.resolve(listRes());
    });
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("lista clientes com nome/telefone e o total", async () => {
    render(<Clientes />);
    expect(await screen.findByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Bruno Alves")).toBeInTheDocument();
    expect(screen.getByText("+5511990000001")).toBeInTheDocument();
    expect(screen.getByText("sem WhatsApp")).toBeInTheDocument(); // Bruno sem telefone
    expect(screen.getByText("2 clientes")).toBeInTheDocument();
  });

  it("busca envia o termo (debounce) e volta para a página 1", async () => {
    render(<Clientes />);
    await screen.findByText("Ana Lima");
    fireEvent.change(screen.getByLabelText("Buscar clientes"), {
      target: { value: "Lima" },
    });
    await waitFor(() => {
      expect(lastGet()).toContain("search=Lima");
      expect(lastGet()).toContain("page=1");
    });
  });

  it("cadastra: abre o modal, salva → POST /clients e recarrega", async () => {
    render(<Clientes />);
    await screen.findByText("Ana Lima");
    fireEvent.click(screen.getByRole("button", { name: /Nova cliente/ }));
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Carla Nova" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const post = apiMock.mock.calls.find(
        ([p, o]) => p === "/clients" && (o as Opts)?.method === "POST",
      );
      expect((post?.[1] as Opts).body?.name).toBe("Carla Nova");
    });
    // Recarrega a lista (≥2 GETs).
    const gets = apiMock.mock.calls.filter(
      ([p, o]) => String(p).startsWith("/clients?") && (o as Opts | undefined)?.method === undefined,
    );
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it("edita: clica na linha → modal pré-preenchido → PATCH /clients/:id", async () => {
    render(<Clientes />);
    fireEvent.click(await screen.findByRole("button", { name: /Ana Lima/ }));
    // Modal de edição pré-preenchido.
    const nome = screen.getByLabelText("Nome") as HTMLInputElement;
    expect(nome.value).toBe("Ana Lima");
    fireEvent.change(nome, { target: { value: "Ana Lima Souza" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(
        ([p, o]) => p === "/clients/1" && (o as Opts)?.method === "PATCH",
      );
      expect((patch?.[1] as Opts).body?.name).toBe("Ana Lima Souza");
    });
  });

  it("mostra a mensagem REAL da API ao falhar (ex.: telefone duplicado 409)", async () => {
    apiMock.mockImplementation((_path: string, opts?: Opts) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve(
          jsonRes(
            { message: "Já existe uma cliente com esse WhatsApp.", statusCode: 409 },
            false,
          ),
        );
      }
      return Promise.resolve(listRes());
    });
    render(<Clientes />);
    fireEvent.click(await screen.findByRole("button", { name: /Ana Lima/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(
      await screen.findByText("Já existe uma cliente com esse WhatsApp."),
    ).toBeInTheDocument();
  });

  it("empty state quando não há clientes", async () => {
    apiMock.mockImplementation((_path: string, opts?: Opts) => {
      if (opts?.method) return Promise.resolve(jsonRes({}));
      return Promise.resolve(listRes([], 0));
    });
    render(<Clientes />);
    expect(
      await screen.findByText(/Nenhuma cliente cadastrada/),
    ).toBeInTheDocument();
  });
});
