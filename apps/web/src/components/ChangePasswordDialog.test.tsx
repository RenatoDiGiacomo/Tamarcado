import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({ apiRequest: (...a: unknown[]) => apiMock(...a) }));
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));

function jsonRes(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function fill(cur: string, next: string, confirm: string): void {
  fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: cur } });
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
    target: { value: confirm },
  });
}

describe("ChangePasswordDialog", () => {
  beforeEach(() => {
    apiMock.mockReset();
    toastSuccess.mockReset();
    localStorage.setItem("tamarcado.access", "tok");
  });

  it("nova senha curta (< 8) → erro, não chama a API", async () => {
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    fill("atual123", "curta", "curta");
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(
      await screen.findByText(/a nova senha deve ter pelo menos 8/i),
    ).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("confirmação diferente → erro, não chama a API", async () => {
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    fill("atual123", "novaSenha1", "outraSenha1");
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(await screen.findByText(/confirmação não confere/i)).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("sucesso: PATCH /users/me/password, fecha e avisa", async () => {
    apiMock.mockResolvedValue(jsonRes({ ok: true }));
    const onOpenChange = vi.fn();
    render(<ChangePasswordDialog open onOpenChange={onOpenChange} />);
    fill("atual123", "novaSenha1", "novaSenha1");
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    await waitFor(() => {
      const call = apiMock.mock.calls[0];
      expect(call[0]).toBe("/users/me/password");
      expect(call[1].method).toBe("PATCH");
      expect(call[1].body).toEqual({
        currentPassword: "atual123",
        newPassword: "novaSenha1",
      });
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("senha atual incorreta (400) → mostra a mensagem real da API", async () => {
    apiMock.mockResolvedValue(jsonRes({ message: "Senha atual incorreta." }, false));
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    fill("errada", "novaSenha1", "novaSenha1");
    fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(await screen.findByText(/senha atual incorreta/i)).toBeInTheDocument();
  });
});
