import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Equipe } from "./Equipe";

const apiMock = vi.fn();
vi.mock("../lib/session", () => ({
  authedRequest: (...args: unknown[]) => apiMock(...args),
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "o1", accessLevel: "owner" } }),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}
interface Opts {
  method?: string;
  body?: Record<string, unknown>;
}

const flags = { canViewFinanceiro: false, canViewDashboard: false, canManageAllAppointments: false };
const rem0 = { salaryAmount: null, salaryCadence: null, commissionScope: "none", commissionKind: null, commissionValue: null };
const fc0 = { commission: 0, salary: 0, total: 0 };
const members = [
  { id: "o1", name: "Dona", email: "dona@x", accessLevel: "owner", attendsClients: true, isActive: true, ...flags, remuneration: rem0, serviceCommissions: [], forecast: fc0 },
  {
    id: "m1", name: "Bia", email: "bia@x", accessLevel: "professional", attendsClients: false, isActive: true, ...flags,
    remuneration: { salaryAmount: 3000, salaryCadence: "monthly", commissionScope: "professional", commissionKind: "percent", commissionValue: 30 },
    serviceCommissions: [{ serviceId: "s1", serviceName: "Corte", kind: null, value: null }],
    forecast: { commission: 60, salary: 1000, total: 1060 },
  },
  { id: "b1", name: "Cida", email: "cida@x", accessLevel: "professional", attendsClients: true, isActive: true, ...flags, remuneration: rem0, serviceCommissions: [], forecast: fc0 },
];

function routeApi(path: string, opts: Opts = {}): Response {
  const method = opts.method ?? "GET";
  if (path.startsWith("/team?") && method === "GET") return jsonRes({ members });
  if (path.startsWith("/team/") && method === "PATCH") return jsonRes({});
  if (path.startsWith("/users/") && method === "PATCH") return jsonRes({});
  if (path === "/users/invite" && method === "POST")
    return jsonRes({ link: "http://x/aceitar-convite?token=abc" });
  return jsonRes({});
}

describe("Equipe (Story 5.9)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, opts: Opts) => Promise.resolve(routeApi(path, opts)));
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("lista a equipe com a PREVISÃO do período (busca /team)", async () => {
    render(<Equipe />);
    expect(await screen.findByText("Dona")).toBeInTheDocument();
    expect(screen.getByText("Bia")).toBeInTheDocument();
    expect(String(apiMock.mock.calls[0][0])).toContain("/team?from=");
    // Previsão total da Bia (comissão 60 + salário 1000 = 1060).
    expect(screen.getByText(/1\.060,00/)).toBeInTheDocument();
  });

  it("permissão: ligar 'Pode ver Financeiro' → PATCH /users/:id do flag", async () => {
    render(<Equipe />);
    await screen.findByText("Bia");
    fireEvent.click(screen.getByLabelText("Pode ver Financeiro — Bia"));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && (o as Opts)?.method === "PATCH");
      expect((patch?.[1] as Opts).body).toEqual({ can_view_financeiro: true });
    });
  });

  it("desativar exige CONFIRMAÇÃO (não chama a API no 1º clique)", async () => {
    render(<Equipe />);
    await screen.findByText("Bia");
    const desativar = screen.getAllByRole("button", { name: "Desativar" });
    fireEvent.click(desativar[1]); // Bia
    expect(apiMock.mock.calls.some(([, o]) => (o as Opts)?.method === "PATCH")).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: "Sim, desativar" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && (o as Opts)?.method === "PATCH");
      expect((patch?.[1] as Opts).body).toEqual({ is_active: false });
    });
  });

  it("único Dono: Desativar desabilitado + motivo (FR-I3)", async () => {
    render(<Equipe />);
    await screen.findByText("Dona");
    expect(screen.getByText(/único Dono/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Desativar" })[0]).toBeDisabled();
  });

  it("editar remuneração → PATCH /team/:id/remuneration com o corpo montado", async () => {
    render(<Equipe />);
    await screen.findByText("Bia");
    // 3 botões "Editar" (um por card); [1] = Bia.
    fireEvent.click(screen.getAllByRole("button", { name: /Editar/ })[1]);
    expect(await screen.findByText("Remuneração — Bia")).toBeInTheDocument();
    // Pré-preenchido (mensal 3000, comissão % 30) — salva sem redigitar.
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([p, o]) => p === "/team/m1/remuneration" && (o as Opts)?.method === "PATCH");
      expect((patch?.[1] as Opts).body).toMatchObject({
        salaryAmount: 3000,
        salaryCadence: "monthly",
        commissionScope: "professional",
        commissionKind: "percent",
        commissionValue: 30,
      });
    });
  });

  it("convidar gera o link de aceite (POST /users/invite)", async () => {
    render(<Equipe />);
    await screen.findByText("Bia");
    fireEvent.click(screen.getByRole("button", { name: /convidar membro/i }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "novo@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar convite" }));
    expect(await screen.findByDisplayValue("http://x/aceitar-convite?token=abc")).toBeInTheDocument();
    const post = apiMock.mock.calls.find(([p, o]) => p === "/users/invite" && (o as Opts)?.method === "POST");
    expect((post?.[1] as Opts).body).toMatchObject({ name: "Novo", email: "novo@x.com", access_level: "professional" });
  });
});
