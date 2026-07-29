import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Pendentes } from "./Pendentes";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("../lib/usePendentes", () => ({
  usePendentes: () => ({ count: 0, refresh: refreshMock }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const pendente = {
  id: "42",
  clientName: "Maria das Dores",
  serviceId: "3",
  serviceName: "Corte",
  professionalId: null,
  professionalName: null,
  date: "2026-08-01",
  start: "09:00",
  end: "10:00",
  status: "pending",
  source: "link" as const,
};

const attenders = [
  { id: "7", name: "Fernanda" },
  { id: "8", name: "Carla" },
];

/** Responde a carga inicial: GET /pending e GET /users/attenders. */
function seedLoad(list = [pendente]): void {
  apiMock.mockImplementation((path: string) => {
    if (path === "/appointments/pending") {
      return Promise.resolve(jsonRes({ appointments: list }));
    }
    if (path === "/users/attenders") {
      return Promise.resolve(jsonRes({ users: attenders }));
    }
    return Promise.resolve(jsonRes({}));
  });
}

describe("Pendentes", () => {
  beforeEach(() => {
    apiMock.mockReset();
    refreshMock.mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("lista os pendentes e mostra a origem (pelo link)", async () => {
    seedLoad();
    render(<Pendentes />);
    expect(await screen.findByText("Maria das Dores")).toBeInTheDocument();
    expect(screen.getByText("Corte")).toBeInTheDocument();
    expect(screen.getByText(/pelo link/i)).toBeInTheDocument();
  });

  it("estado vazio quando não há pendentes", async () => {
    seedLoad([]);
    render(<Pendentes />);
    expect(
      await screen.findByText(/nenhuma solicitação pendente/i),
    ).toBeInTheDocument();
  });

  it("Confirmar com profissional → PATCH :id/confirm {professionalId} e some da lista", async () => {
    seedLoad();
    render(<Pendentes />);
    await screen.findByText("Maria das Dores");

    // escolhe um profissional (opcional) e confirma
    fireEvent.change(screen.getByLabelText("Profissional"), {
      target: { value: "7" },
    });
    apiMock.mockResolvedValueOnce(jsonRes({ status: "confirmed" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/appointments/42/confirm",
        expect.objectContaining({
          method: "PATCH",
          body: { professionalId: "7" },
        }),
      );
    });
    await waitFor(() =>
      expect(screen.queryByText("Maria das Dores")).toBeNull(),
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it("Confirmar sem profissional → body vazio (professionalId opcional)", async () => {
    seedLoad();
    render(<Pendentes />);
    await screen.findByText("Maria das Dores");
    apiMock.mockResolvedValueOnce(jsonRes({ status: "confirmed" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/appointments/42/confirm",
        expect.objectContaining({ method: "PATCH", body: {} }),
      );
    });
  });

  it("Recusar exige motivo: vazio não chama a API; com motivo → PATCH :id/reject", async () => {
    seedLoad();
    render(<Pendentes />);
    await screen.findByText("Maria das Dores");

    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    // tenta recusar sem motivo → erro, sem chamada
    fireEvent.click(screen.getByRole("button", { name: /confirmar recusa/i }));
    expect(await screen.findByText(/motivo é obrigatório/i)).toBeInTheDocument();
    expect(
      apiMock.mock.calls.some((c) => String(c[0]).includes("/reject")),
    ).toBe(false);

    // agora com motivo
    fireEvent.change(screen.getByLabelText(/motivo da recusa/i), {
      target: { value: "Sem horário nesse dia" },
    });
    apiMock.mockResolvedValueOnce(jsonRes({ status: "cancelled" }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar recusa/i }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/appointments/42/reject",
        expect.objectContaining({
          method: "PATCH",
          body: { reason: "Sem horário nesse dia" },
        }),
      );
    });
    await waitFor(() =>
      expect(screen.queryByText("Maria das Dores")).toBeNull(),
    );
    expect(refreshMock).toHaveBeenCalled();
  });
});
