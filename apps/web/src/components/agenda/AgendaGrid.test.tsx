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

  // Regressão de layout: cada badge de status vive numa COLUNA DE LARGURA FIXA
  // à direita do card, centralizada nela (H) e no card (V) — assim status de
  // larguras diferentes ("Concluído", "Cancelado", "Não compareceu") alinham
  // entre si. Trava as classes para que uma regeneração da tela não desalinhe.
  it("mantém as badges de status numa coluna fixa centralizada (H e V)", () => {
    renderGrid(); // visão dia (não-compact)
    for (const label of ["Concluído", "Cancelado", "Não compareceu"]) {
      for (const chip of screen.getAllByText(label)) {
        const col = chip.parentElement as HTMLElement;
        // Coluna de largura fixa (não a borda direita coincidindo).
        expect(col.className).toMatch(/w-\[\d+px\]/);
        expect(col.className).toContain("shrink-0");
        // Centralizada dentro da coluna (H) e no card (V).
        expect(col.className).toContain("justify-center");
        expect(col.className).toContain("items-center");
      }
    }
  });
});
