import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ErrorState, errorKindFrom } from "./ErrorState";
import { ApiConnectionError } from "../lib/api";

describe("ErrorState", () => {
  it("SEM CONEXÃO: mensagem própria de rede + tentar de novo", () => {
    const onRetry = vi.fn();
    render(<ErrorState kind="connection" resource="a agenda" onRetry={onRetry} />);
    expect(screen.getByText("Sem conexão")).toBeInTheDocument();
    expect(screen.getByText(/conectar ao servidor/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ERRO DO SERVIDOR: mensagem distinta, nomeando o recurso", () => {
    render(<ErrorState kind="server" resource="os clientes" onRetry={() => {}} />);
    expect(
      screen.getByText("Não foi possível carregar os clientes"),
    ).toBeInTheDocument();
    expect(screen.getByText(/problema no servidor/i)).toBeInTheDocument();
    // A mensagem de conexão NÃO aparece — os dois estados são distintos.
    expect(screen.queryByText("Sem conexão")).toBeNull();
  });

  it("errorKindFrom distingue transporte de erro de servidor", () => {
    expect(errorKindFrom(new ApiConnectionError())).toBe("connection");
    expect(errorKindFrom(new Error("boom"))).toBe("server");
    expect(errorKindFrom("qualquer coisa")).toBe("server");
  });
});
