import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("mostra título, descrição e ação", () => {
    render(
      <EmptyState
        title="Nenhum agendamento"
        description="Comece criando um."
        action={<button type="button">Novo</button>}
      />,
    );
    expect(screen.getByText("Nenhum agendamento")).toBeInTheDocument();
    expect(screen.getByText("Comece criando um.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo" })).toBeInTheDocument();
  });
});
