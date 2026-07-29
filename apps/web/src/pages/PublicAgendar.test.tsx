import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
});
