import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { ClientePerfil } from "./ClientePerfil";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", accessLevel: "owner" } }),
}));
vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "1" }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

interface Opts {
  method?: string;
  body?: Record<string, unknown>;
}
function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const profile = {
  id: "1",
  name: "Ana Lima",
  phone_whatsapp: "+5511990000001",
  notes: "Alérgica a amônia.",
  createdAt: "2026-07-20T10:00:00.000Z",
};
const history = [
  { id: "a1", serviceName: "Corte", professionalName: "Fernanda", date: "2026-03-20", start: "15:00", end: "16:00", status: "confirmed" },
  { id: "a2", serviceName: "Escova", professionalName: null, date: "2026-01-10", start: "09:00", end: "09:45", status: "completed" },
];

function routeApi(path: string, opts?: Opts, historyList = history): Response {
  if (path === "/clients/1" && opts?.method === "PATCH") return jsonRes({});
  if (path === "/clients/1/appointments") return jsonRes({ appointments: historyList });
  if (path === "/clients/1") return jsonRes(profile);
  if (path === "/services") return jsonRes({ services: [{ id: "s1", name: "Corte", isActive: true }] });
  if (path === "/users/attenders") return jsonRes({ users: [{ id: "p1", name: "Fernanda" }] });
  return jsonRes({});
}

describe("ClientePerfil", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, opts?: Opts) =>
      Promise.resolve(routeApi(path, opts)),
    );
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("mostra dados, observações e histórico (serviço/data/status/profissional)", async () => {
    render(<ClientePerfil />);
    expect(await screen.findByText("Ana Lima")).toBeInTheDocument(); // título
    expect(screen.getByText("+5511990000001")).toBeInTheDocument();
    expect(screen.getByText("20/07/2026")).toBeInTheDocument(); // cliente desde
    // Observações pré-preenchidas.
    expect((screen.getByLabelText("Observações da cliente") as HTMLTextAreaElement).value).toBe(
      "Alérgica a amônia.",
    );
    // Histórico.
    expect(screen.getByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("Escova")).toBeInTheDocument();
    expect(screen.getByText("Não atribuído")).toBeInTheDocument(); // a2 sem profissional
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.getByText("Concluído")).toBeInTheDocument();
  });

  it("EmptyState quando não há histórico", async () => {
    apiMock.mockImplementation((path: string, opts?: Opts) =>
      Promise.resolve(routeApi(path, opts, [])),
    );
    render(<ClientePerfil />);
    expect(await screen.findByText(/Nenhum agendamento ainda/)).toBeInTheDocument();
  });

  it("salva observação → PATCH /clients/1 com notes", async () => {
    render(<ClientePerfil />);
    await screen.findByText("Ana Lima");
    fireEvent.change(screen.getByLabelText("Observações da cliente"), {
      target: { value: "Prefere manhã." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar observação" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(
        ([p, o]) => p === "/clients/1" && (o as Opts)?.method === "PATCH",
      );
      expect((patch?.[1] as Opts).body).toEqual({ notes: "Prefere manhã." });
    });
  });

  it("registra pagamento de um atendimento no perfil (DL-066) → PUT /appointments/:id/payment", async () => {
    render(<ClientePerfil />);
    await screen.findByText("Corte");
    // Owner tem Financeiro → cada atendimento oferece registrar pagamento.
    const botoes = screen.getAllByRole("button", { name: "Registrar pagamento" });
    fireEvent.click(botoes[0]); // primeiro atendimento (a1)
    // Abre o MESMO PaymentForm (valor/situação/forma).
    fireEvent.change(await screen.findByLabelText("Valor recebido"), {
      target: { value: "5000" }, // máscara: centavos → R$ 50,00
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      const put = apiMock.mock.calls.find(
        ([p, o]) =>
          String(p) === "/appointments/a1/payment" &&
          (o as Opts)?.method === "PUT",
      );
      expect((put?.[1] as Opts).body).toEqual({
        amount: 50,
        method: undefined,
        status: "pago",
      });
    });
  });

  it("atalho 'Novo agendamento' abre o fluxo com a cliente pré-selecionada", async () => {
    render(<ClientePerfil />);
    await screen.findByText("Ana Lima");
    fireEvent.click(screen.getByRole("button", { name: /Novo agendamento/ }));
    // O modal abre e a cliente já vem selecionada (nome + botão "trocar").
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Ana Lima");
    expect(screen.getByRole("button", { name: "trocar" })).toBeInTheDocument();
  });
});
