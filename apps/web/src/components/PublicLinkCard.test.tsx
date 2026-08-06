import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PublicLinkCard } from "./PublicLinkCard";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiMock(...args),
}));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const GET = {
  slug: "salao-da-ana",
  publicUrl: "http://localhost:5173/agendar/salao-da-ana",
};

describe("PublicLinkCard", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    apiMock.mockReset();
    writeText.mockClear();
    localStorage.setItem("tamarcado.access", "tok");
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("mostra o endereço e copia sem seleção manual", async () => {
    apiMock.mockResolvedValue(jsonRes(GET));
    render(<PublicLinkCard />);
    await screen.findByText(GET.publicUrl);
    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(GET.publicUrl));
    expect(await screen.findByText(/copiado/i)).toBeInTheDocument();
  });

  it("slug inválido bloqueia o salvar", async () => {
    apiMock.mockResolvedValue(jsonRes(GET));
    render(<PublicLinkCard />);
    await screen.findByText(GET.publicUrl);
    fireEvent.change(screen.getByLabelText(/endereço personalizado/i), {
      target: { value: "Salão Novo" },
    });
    expect(await screen.findByText(/endereço inválido/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /salvar novo endereço/i }),
    ).toBeDisabled();
  });

  it("trocar o slug exige confirmação COM o aviso de que não há redirect", async () => {
    apiMock.mockResolvedValueOnce(jsonRes(GET)); // GET inicial
    render(<PublicLinkCard />);
    await screen.findByText(GET.publicUrl);

    fireEvent.change(screen.getByLabelText(/endereço personalizado/i), {
      target: { value: "studio-ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar novo endereço/i }));

    // Aviso explícito, não um "tem certeza?" genérico.
    expect(await screen.findByText(/trocar o endereço do link/i)).toBeInTheDocument();
    expect(screen.getByText(/parar de funcionar/i)).toBeInTheDocument();

    apiMock.mockResolvedValueOnce(
      jsonRes({ slug: "studio-ana", publicUrl: "http://localhost:5173/agendar/studio-ana" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /sim, trocar o endereço/i }));

    await waitFor(() => {
      const patch = apiMock.mock.calls.find(([, o]) => o?.method === "PATCH");
      expect(patch?.[0]).toBe("/installation/slug");
      expect(patch?.[1].body).toEqual({ slug: "studio-ana" });
    });
    await screen.findByText("http://localhost:5173/agendar/studio-ana");
  });

  it("endereço em uso → mostra a mensagem real (409)", async () => {
    apiMock.mockResolvedValueOnce(jsonRes(GET));
    render(<PublicLinkCard />);
    await screen.findByText(GET.publicUrl);
    fireEvent.change(screen.getByLabelText(/endereço personalizado/i), {
      target: { value: "ocupado" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar novo endereço/i }));
    await screen.findByText(/trocar o endereço do link/i);

    apiMock.mockResolvedValueOnce(
      jsonRes({ message: "Este endereço já está em uso." }, false),
    );
    fireEvent.click(screen.getByRole("button", { name: /sim, trocar o endereço/i }));
    expect(await screen.findByText(/já está em uso/i)).toBeInTheDocument();
  });
});
