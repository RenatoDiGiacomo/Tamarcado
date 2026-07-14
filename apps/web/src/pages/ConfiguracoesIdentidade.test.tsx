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
    expect(apiMock).toHaveBeenLastCalledWith(
      "/installation",
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          name: "Agenda da Fernanda",
          logoUrl: "https://cdn.exemplo.com/logo.png",
        }),
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
