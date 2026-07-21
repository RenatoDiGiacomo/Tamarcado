import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfiguracoesEquipe } from "./ConfiguracoesEquipe";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}
interface Opts {
  method?: string;
  body?: Record<string, unknown>;
}

const members = [
  { id: "o1", name: "Dona", email: "dona@x", accessLevel: "owner", attendsClients: true, isActive: true },
  { id: "m1", name: "Bia", email: "bia@x", accessLevel: "manager", attendsClients: false, isActive: true },
  { id: "b1", name: "Cida", email: "cida@x", accessLevel: "basic", attendsClients: true, isActive: true },
];

function routeApi(path: string, opts: Opts = {}): Response {
  const method = opts.method ?? "GET";
  if (path === "/users" && method === "GET") return jsonRes({ total: 3, users: members });
  if (path.startsWith("/users/") && method === "PATCH") {
    const id = path.split("/")[2];
    const base = members.find((m) => m.id === id)!;
    return jsonRes({ ...base, ...opts.body, accessLevel: opts.body?.access_level ?? base.accessLevel });
  }
  if (path === "/users/invite" && method === "POST")
    return jsonRes({ link: "http://x/aceitar-convite?token=abc", expiresAt: "2026-08-01" });
  return jsonRes({});
}

describe("ConfiguracoesEquipe", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string, opts: Opts) =>
      Promise.resolve(routeApi(path, opts)),
    );
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("lista a equipe (Dono read-only, membros com papel)", async () => {
    render(<ConfiguracoesEquipe />);
    expect(await screen.findByText("Dona")).toBeInTheDocument();
    expect(screen.getByText("Bia")).toBeInTheDocument();
    // Dono não tem select de papel (read-only).
    expect(screen.queryByLabelText("Papel de Dona")).toBeNull();
    expect(screen.getByLabelText("Papel de Bia")).toBeInTheDocument();
  });

  it("auto-save do papel (PATCH access_level)", async () => {
    render(<ConfiguracoesEquipe />);
    await screen.findByText("Bia");
    fireEvent.change(screen.getByLabelText("Papel de Bia"), { target: { value: "basic" } });
    await waitFor(() =>
      expect(
        apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && o?.method === "PATCH"),
      ).toBeTruthy(),
    );
    const patch = apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && o?.method === "PATCH");
    expect(patch?.[1].body).toEqual({ access_level: "basic" });
  });

  it("auto-save do atende (PATCH attends_clients)", async () => {
    render(<ConfiguracoesEquipe />);
    await screen.findByText("Cida");
    fireEvent.click(screen.getByLabelText("Atende clientes — Cida"));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.find(([p, o]) => p === "/users/b1" && o?.method === "PATCH"),
      ).toBeTruthy(),
    );
    const patch = apiMock.mock.calls.find(([p, o]) => p === "/users/b1" && o?.method === "PATCH");
    expect(patch?.[1].body).toEqual({ attends_clients: false });
  });

  it("desativar exige CONFIRMAÇÃO (não chama a API no primeiro clique)", async () => {
    render(<ConfiguracoesEquipe />);
    await screen.findByText("Bia");
    // Botões "Desativar": [0]=Dona (desabilitado), [1]=Bia, [2]=Cida.
    const rowButtons = screen.getAllByRole("button", { name: "Desativar" });
    fireEvent.click(rowButtons[1]); // Bia (m1)
    // Ainda não chamou PATCH.
    expect(apiMock.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
    // Confirma.
    fireEvent.click(await screen.findByRole("button", { name: "Sim, desativar" }));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && o?.method === "PATCH"),
      ).toBeTruthy(),
    );
    const patch = apiMock.mock.calls.find(([p, o]) => p === "/users/m1" && o?.method === "PATCH");
    expect(patch?.[1].body).toEqual({ is_active: false });
  });

  it("único Dono: desativar desabilitado + motivo visível (FR-I3)", async () => {
    render(<ConfiguracoesEquipe />);
    await screen.findByText("Dona");
    expect(screen.getByText(/único Dono/i)).toBeInTheDocument();
    // A Dona é o 1º membro; seu botão "Desativar" está desabilitado.
    expect(screen.getAllByRole("button", { name: "Desativar" })[0]).toBeDisabled();
  });

  it("mostra a mensagem real da API no erro (ex.: último Dono via 409)", async () => {
    apiMock.mockImplementation((path: string, opts: Opts) => {
      if (path.startsWith("/users/") && opts.method === "PATCH")
        return Promise.resolve(
          jsonRes({ message: "Não é possível rebaixar ou desativar o único Dono. Transfira a titularidade antes." }, false),
        );
      return Promise.resolve(routeApi(path, opts));
    });
    render(<ConfiguracoesEquipe />);
    await screen.findByText("Bia");
    fireEvent.change(screen.getByLabelText("Papel de Bia"), { target: { value: "basic" } });
    expect(
      await screen.findByText(/Transfira a titularidade antes/i),
    ).toBeInTheDocument();
  });

  it("convidar gera o link de aceite", async () => {
    render(<ConfiguracoesEquipe />);
    await screen.findByText("Bia");
    fireEvent.click(screen.getByRole("button", { name: /convidar membro/i }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "novo@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar convite" }));

    expect(
      await screen.findByDisplayValue("http://x/aceitar-convite?token=abc"),
    ).toBeInTheDocument();
    const post = apiMock.mock.calls.find(([p, o]) => p === "/users/invite" && o?.method === "POST");
    expect(post?.[1].body).toMatchObject({ name: "Novo", email: "novo@x.com", access_level: "basic" });
  });
});
