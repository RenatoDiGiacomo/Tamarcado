import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useInstallation, refreshInstallation } from "./useInstallation";

const apiMock = vi.fn();
vi.mock("./api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function Probe({ label }: { label: string }) {
  const inst = useInstallation();
  return <span>{`${label}:${inst?.primaryColor ?? "none"}`}</span>;
}

describe("useInstallation (store compartilhado)", () => {
  beforeEach(() => {
    apiMock.mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("revalidar aplica a cor nova em TODOS os consumidores (sem reload)", async () => {
    apiMock.mockResolvedValue(
      jsonRes({ name: "X", logoUrl: null, primaryColor: "#111111" }),
    );
    // Dois consumidores independentes (ex.: AppShell + outra tela).
    render(
      <>
        <Probe label="a" />
        <Probe label="b" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getByText("a:#111111")).toBeInTheDocument();
      expect(screen.getByText("b:#111111")).toBeInTheDocument();
    });

    // Cor muda no backend e alguém revalida (como faz a Identidade ao salvar).
    apiMock.mockResolvedValue(
      jsonRes({ name: "X", logoUrl: null, primaryColor: "#E91E63" }),
    );
    await act(async () => {
      await refreshInstallation();
    });

    // Ambos repintam na hora, sem remontar.
    await waitFor(() => {
      expect(screen.getByText("a:#E91E63")).toBeInTheDocument();
      expect(screen.getByText("b:#E91E63")).toBeInTheDocument();
    });
  });
});
