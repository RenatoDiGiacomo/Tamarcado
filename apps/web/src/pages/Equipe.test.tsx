import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Equipe } from "./Equipe";

const apiMock = vi.fn();
vi.mock("../lib/session", () => ({
  authedRequest: (...args: unknown[]) => apiMock(...args),
}));
const useAuthMock = vi.fn(() => ({ user: { id: "o1", accessLevel: "owner" } }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => useAuthMock() }));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}
interface Opts {
  method?: string;
  body?: Record<string, unknown>;
}

const flags = { canViewFinanceiro: false, canViewDashboard: false, canViewEquipe: false, canManageAllAppointments: false };
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
  if (path === "/users/invite" && method === "POST") return jsonRes({ link: "http://x/aceitar-convite?token=abc" });
  return jsonRes({});
}

describe("Equipe (Story 5.9)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, opts: Opts) => Promise.resolve(routeApi(path, opts)));
    useAuthMock.mockReturnValue({ user: { id: "o1", accessLevel: "owner" } });
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("lista (accordion) com a PREVISÃO no cabeçalho (busca /team)", async () => {
    render(<Equipe />);
    expect(await screen.findByText("Dona")).toBeInTheDocument();
    expect(screen.getByText("Bia")).toBeInTheDocument();
    expect(String(apiMock.mock.calls[0][0])).toContain("/team?from=");
    // Previsão total da Bia aparece no cabeçalho, sem expandir.
    expect(screen.getByText(/1\.060,00/)).toBeInTheDocument();
  });

  it("filtro por nome esconde os demais", async () => {
    render(<Equipe />);
    await screen.findByText("Bia");
    fireEvent.change(screen.getByLabelText("Filtrar por nome"), { target: { value: "Cida" } });
    expect(screen.getByText("Cida")).toBeInTheDocument();
    expect(screen.queryByText("Bia")).toBeNull();
  });

  it("expande e liga 'Pode ver Equipe' → PATCH /users/:id", async () => {
    render(<Equipe />);
    fireEvent.click(await screen.findByText("Bia")); // expande
    fireEvent.click(screen.getByLabelText("Pode ver Equipe — Bia"));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && (o as Opts)?.method === "PATCH");
      expect((patch?.[1] as Opts).body).toEqual({ can_view_equipe: true });
    });
  });

  it("desativar (expandido) exige CONFIRMAÇÃO", async () => {
    render(<Equipe />);
    fireEvent.click(await screen.findByText("Bia")); // expande
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    expect(apiMock.mock.calls.some(([, o]) => (o as Opts)?.method === "PATCH")).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: "Sim, desativar" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && (o as Opts)?.method === "PATCH");
      expect((patch?.[1] as Opts).body).toEqual({ is_active: false });
    });
  });

  it("editar remuneração (expandido) → PATCH /team/:id/remuneration", async () => {
    render(<Equipe />);
    fireEvent.click(await screen.findByText("Bia")); // expande
    fireEvent.click(screen.getByRole("button", { name: /Editar/ }));
    expect(await screen.findByText("Remuneração — Bia")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([p, o]) => p === "/team/m1/remuneration" && (o as Opts)?.method === "PATCH");
      expect((patch?.[1] as Opts).body).toMatchObject({
        salaryAmount: 3000, salaryCadence: "monthly", commissionScope: "professional", commissionKind: "percent", commissionValue: 30,
      });
    });
  });

  it("convidar abre dialog e gera o link (POST /users/invite)", async () => {
    render(<Equipe />);
    await screen.findByText("Bia");
    fireEvent.click(screen.getByRole("button", { name: /Convidar membro/ }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "novo@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar convite" }));
    expect(await screen.findByDisplayValue("http://x/aceitar-convite?token=abc")).toBeInTheDocument();
    const post = apiMock.mock.calls.find(([p, o]) => p === "/users/invite" && (o as Opts)?.method === "POST");
    expect((post?.[1] as Opts).body).toMatchObject({ name: "Novo", email: "novo@x.com", access_level: "professional" });
  });

  it("viewer não-Dono (can_view_equipe): vê a lista mas SEM convidar/editar", async () => {
    useAuthMock.mockReturnValue({ user: { id: "p9", accessLevel: "professional" } });
    render(<Equipe />);
    await screen.findByText("Bia");
    // Sem botão de convidar.
    expect(screen.queryByRole("button", { name: /Convidar membro/ })).toBeNull();
    // Expandir não revela ações de edição (Editar/toggles).
    fireEvent.click(screen.getByText("Bia"));
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.queryByLabelText("Pode ver Equipe — Bia")).toBeNull();
  });
});
