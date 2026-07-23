import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfiguracoesIdentidade } from "./ConfiguracoesIdentidade";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe("ConfiguracoesIdentidade", () => {
  beforeEach(() => {
    apiMock.mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("faz prefill do GET /installation e salva via PATCH (AC1)", async () => {
    apiMock.mockResolvedValueOnce(
      jsonRes({ name: "Salão", logoUrl: null, primaryColor: "#E91E63" }),
    );
    render(<ConfiguracoesIdentidade />);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nome da instalação") as HTMLInputElement).value,
      ).toBe("Salão"),
    );

    apiMock.mockResolvedValueOnce(jsonRes({}, true));
    fireEvent.change(screen.getByLabelText("Nome da instalação"), {
      target: { value: "Agenda da Fernanda" },
    });
    fireEvent.change(screen.getByLabelText("URL do logo"), {
      target: { value: "https://cdn.exemplo.com/logo.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toBeInTheDocument(),
    );
    // (o refreshInstallation dispara um GET depois do PATCH — busca a chamada PATCH).
    const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(patch?.[1].body).toEqual(
      expect.objectContaining({
        name: "Agenda da Fernanda",
        logoUrl: "https://cdn.exemplo.com/logo.png",
      }),
    );
  });

  it("preset preenche o hex e marca o preset ativo (AC4)", async () => {
    apiMock.mockResolvedValueOnce(
      jsonRes({ name: "Salão", logoUrl: null, primaryColor: "#6c63ff" }),
    );
    render(<ConfiguracoesIdentidade />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nome da instalação") as HTMLInputElement).value,
      ).toBe("Salão"),
    );

    const preset = screen.getByRole("button", { name: "Cor Terracota" });
    fireEvent.click(preset);

    expect((screen.getByLabelText("Cor primária") as HTMLInputElement).value).toBe(
      "#B85C38",
    );
    expect(preset).toHaveAttribute("aria-pressed", "true");
  });

  it("prefill do horário de funcionamento e envia no PATCH", async () => {
    apiMock.mockResolvedValueOnce(
      jsonRes({
        name: "Salão",
        logoUrl: null,
        primaryColor: "#6c63ff",
        businessHoursStart: "10:00",
        businessHoursEnd: "21:00",
      }),
    );
    render(<ConfiguracoesIdentidade />);
    await waitFor(() =>
      expect((screen.getByLabelText("Abertura") as HTMLInputElement).value).toBe("10:00"),
    );
    expect((screen.getByLabelText("Fechamento") as HTMLInputElement).value).toBe("21:00");

    apiMock.mockResolvedValueOnce(jsonRes({}, true));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(patch?.[1].body).toEqual(
      expect.objectContaining({
        businessHoursStart: "10:00",
        businessHoursEnd: "21:00",
      }),
    );
  });

  it("ao salvar, revalida a instalação (GET após o PATCH) — corrige repintar sem reload", async () => {
    apiMock.mockResolvedValueOnce(
      jsonRes({ name: "Salão", logoUrl: null, primaryColor: "#6c63ff" }),
    );
    render(<ConfiguracoesIdentidade />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nome da instalação") as HTMLInputElement).value,
      ).toBe("Salão"),
    );
    apiMock.mockResolvedValueOnce(jsonRes({}, true)); // PATCH
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    // Há um GET /installation DEPOIS do PATCH (revalidação do branding).
    await waitFor(() => {
      const patchIdx = apiMock.mock.calls.findIndex(([, o]) => o?.method === "PATCH");
      const getAfter = apiMock.mock.calls
        .slice(patchIdx + 1)
        .some(([p, o]) => p === "/installation" && o?.method === undefined);
      expect(getAfter).toBe(true);
    });
  });

  it("bloqueia salvar se o fechamento não é após a abertura (não chama a API)", async () => {
    apiMock.mockResolvedValueOnce(
      jsonRes({
        name: "Salão",
        logoUrl: null,
        primaryColor: "#6c63ff",
        businessHoursStart: "10:00",
        businessHoursEnd: "21:00",
      }),
    );
    render(<ConfiguracoesIdentidade />);
    await waitFor(() =>
      expect((screen.getByLabelText("Abertura") as HTMLInputElement).value).toBe("10:00"),
    );
    fireEvent.change(screen.getByLabelText("Fechamento"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    expect(
      await screen.findByText(/fechamento deve ser após a abertura/i),
    ).toBeInTheDocument();
    // Só houve o GET inicial — nenhum PATCH.
    expect(apiMock.mock.calls.filter(([, o]) => o?.method === "PATCH")).toHaveLength(0);
  });

  it("exibe erro quando o PATCH falha", async () => {
    apiMock.mockResolvedValueOnce(
      jsonRes({ name: "Salão", logoUrl: null, primaryColor: "#6c63ff" }),
    );
    render(<ConfiguracoesIdentidade />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nome da instalação") as HTMLInputElement).value,
      ).toBe("Salão"),
    );

    apiMock.mockResolvedValueOnce(jsonRes({}, false));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
