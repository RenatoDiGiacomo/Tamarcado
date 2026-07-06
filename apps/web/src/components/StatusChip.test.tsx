import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusChip } from "./StatusChip";

describe("StatusChip", () => {
  it("renderiza o rótulo de cada status", () => {
    const { rerender } = render(<StatusChip status="confirmed" />);
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    rerender(<StatusChip status="done" />);
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    rerender(<StatusChip status="cancelled" />);
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    rerender(<StatusChip status="noshow" />);
    expect(screen.getByText("Não compareceu")).toBeInTheDocument();
  });
});
