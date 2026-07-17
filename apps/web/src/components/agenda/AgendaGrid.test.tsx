import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgendaGrid } from "./AgendaGrid";
import { MOCK_APPOINTMENTS } from "./mock";

function renderGrid(props?: Partial<ComponentProps<typeof AgendaGrid>>) {
  return render(
    <AgendaGrid
      dateLabel="Ter, 17/06"
      businessHours={{ start: "08:00", end: "17:00" }}
      appointments={MOCK_APPOINTMENTS}
      {...props}
    />,
  );
}

describe("AgendaGrid", () => {
  it("mostra os agendamentos e o status/origem no dia", () => {
    renderGrid();
    expect(screen.getByText("Maria das Dores")).toBeInTheDocument();
    expect(screen.getAllByText("Confirmado").length).toBeGreaterThan(0);
    // "Não atribuído" em itálico para professional_id nulo
    expect(screen.getByText("Não atribuído")).toBeInTheDocument();
    // ícones de origem
    expect(screen.getAllByLabelText("Manual").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("WhatsApp")).toBeInTheDocument();
  });

  it('"Mês" está desabilitado (em breve)', () => {
    renderGrid();
    expect(screen.getByRole("button", { name: /mês/i })).toBeDisabled();
  });

  it("alterna para a visão Semana (colunas seg–dom)", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(screen.getByText("Seg")).toBeInTheDocument();
    expect(screen.getByText("Dom")).toBeInTheDocument();
  });

  it("filtra por origem (WhatsApp esconde os manuais)", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(screen.queryByText("Maria das Dores")).not.toBeInTheDocument();
    expect(screen.getByText("Rita Alves")).toBeInTheDocument();
  });

  it("dispara onSelect ao clicar num agendamento e onNew no FAB", () => {
    const onSelect = vi.fn();
    const onNew = vi.fn();
    renderGrid({ onSelect, onNew });
    fireEvent.click(screen.getByText("Maria das Dores"));
    expect(onSelect).toHaveBeenCalledWith("2");
    fireEvent.click(screen.getByRole("button", { name: /novo agendamento/i }));
    expect(onNew).toHaveBeenCalled();
  });

  // Regressão de layout (fix 3.2): as badges de status ficam TODAS na mesma
  // margem direita do card. Trava as classes que garantem isso para que uma
  // regeneração da tela não volte a desalinhá-las. Rótulos únicos no mock:
  // "Concluído" (done) e "Cancelado" (cancelled).
  it("mantém as badges de status alinhadas na margem direita do card", () => {
    renderGrid();
    for (const label of ["Concluído", "Cancelado"]) {
      const chip = screen.getByText(label);
      // Chip não encolhe → cola na direita.
      expect(chip.className).toContain("shrink-0");
      const row = chip.parentElement as HTMLElement;
      // A linha empurra o chip para a direita.
      expect(row.className).toContain("justify-between");
      // O texto do serviço encolhe/trunca (min-w-0) em vez de deslocar o chip.
      const serviceText = row.firstElementChild as HTMLElement;
      expect(serviceText.className).toContain("min-w-0");
    }
  });
});
