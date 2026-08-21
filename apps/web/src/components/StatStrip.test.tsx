import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { StatStrip, type StatItem } from "./StatStrip";

/** Igual ao Financeiro/Dashboard: quem decide a forma da tela é o matchMedia. */
function setViewport(kind: "mobile" | "desktop"): void {
  window.matchMedia = ((query: string) => ({
    matches: kind === "desktop",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const ITEMS: StatItem[] = [
  {
    key: "bruto",
    label: "Valor bruto",
    value: "R$ 800,00",
    hint: "A receber: R$ 200,00",
    info: "Soma de tudo que entrou no período.",
  },
  { key: "vendas", label: "Vendas", value: "16", info: "Contagem dos pagos." },
  { key: "ticket", label: "Ticket médio", value: "R$ 50,00" },
];

describe("StatStrip — indicadores (faixa no celular, grade no PC)", () => {
  beforeEach(() => setViewport("mobile"));

  it("mobile: mostra todos os indicadores numa região rolável, com um ponto para cada", () => {
    const { container } = render(
      <StatStrip items={ITEMS} label="Indicadores do período" />,
    );
    // Todos existem — o que está fora da tela continua no documento (rola).
    for (const it of ITEMS) {
      expect(screen.getByText(it.label)).toBeInTheDocument();
      expect(screen.getByText(it.value)).toBeInTheDocument();
    }
    expect(screen.getByText("A receber: R$ 200,00")).toBeInTheDocument();
    // A faixa é uma região com nome (leitor de tela) e recebe foco p/ rolar.
    const região = screen.getByRole("region", { name: "Indicadores do período" });
    expect(região).toHaveAttribute("tabindex", "0");
    // Um pontinho por indicador: é quem diz que há mais para o lado.
    expect(container.querySelectorAll("[aria-hidden='true'] > span")).toHaveLength(
      ITEMS.length,
    );
  });

  it("mobile: a dica abre num bloco abaixo da faixa (não seria visível dentro do cartão)", () => {
    render(<StatStrip items={ITEMS} label="Indicadores do período" />);
    expect(screen.queryByRole("note")).toBeNull();
    const i = screen.getByRole("button", { name: "O que é Valor bruto?" });
    fireEvent.click(i);
    const nota = screen.getByRole("note");
    expect(nota).toHaveTextContent("Soma de tudo que entrou no período.");
    // Fora do container que rola — senão o texto sairia cortado na borda.
    expect(
      screen
        .getByRole("region", { name: "Indicadores do período" })
        .contains(nota),
    ).toBe(false);
    fireEvent.click(i); // segundo toque fecha
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("mobile: o ponto aceso acompanha a rolagem, e no fim é o ÚLTIMO", () => {
    const { container } = render(
      <StatStrip items={ITEMS} label="Indicadores do período" />,
    );
    const faixa = screen.getByRole("region", { name: "Indicadores do período" });
    const pontos = () => [
      ...container.querySelectorAll("[aria-hidden='true'] > span"),
    ];
    // jsdom não calcula layout — descrevemos a geometria da faixa na mão.
    Object.defineProperty(faixa, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(faixa, "scrollWidth", { value: 900, configurable: true });

    faixa.scrollLeft = 0;
    fireEvent.scroll(faixa);
    expect(pontos()[0].className).toContain("bg-primary");
    expect(pontos()[ITEMS.length - 1].className).not.toContain("bg-primary");

    // Fim da rolagem: os últimos cartões cabem juntos, então o "mais próximo da
    // borda" ainda não é o último — o último ponto precisa acender mesmo assim.
    faixa.scrollLeft = 600;
    fireEvent.scroll(faixa);
    expect(pontos()[ITEMS.length - 1].className).toContain("bg-primary");
  });

  it("indicador sem explicação não ganha o (i)", () => {
    render(<StatStrip items={ITEMS} label="Totais do período" />);
    expect(screen.queryByRole("button", { name: "O que é Ticket médio?" })).toBeNull();
  });

  it("desktop: volta a ser a grade de cartões, com a dica dentro do cartão", () => {
    setViewport("desktop");
    render(
      <StatStrip
        items={ITEMS}
        label="Indicadores do período"
        gridClassName="md:grid-cols-3"
      />,
    );
    // Sem faixa rolável nem pontinhos — é a grade de sempre.
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByText("Valor bruto")).toBeInTheDocument();
    // A dica do desktop é o InfoTip (balão ancorado no próprio cartão).
    fireEvent.click(screen.getByRole("button", { name: "O que é Vendas?" }));
    expect(screen.getByRole("note")).toHaveTextContent("Contagem dos pagos.");
  });
});
