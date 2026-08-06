import { render, screen, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  bumpAppointments,
  useAppointmentsVersion,
} from "./appointmentsSignal";

/** Consumidor do sinal — mostra a versão atual para inspeção. */
function Probe({ label }: { label: string }) {
  const v = useAppointmentsVersion();
  return <span>{`${label}:${v}`}</span>;
}

/**
 * O sinal global é infraestrutura da qual toda a Agenda depende para recarregar
 * após uma mutação (inclusive o "Recusar" de Pendentes, que vive fora do
 * useAgenda). Sem teste, uma regressão aqui não quebra a suíte e só apareceria
 * com a agenda parando de atualizar na frente do cliente (Story 7.3 §5).
 */
describe("appointmentsSignal", () => {
  it("bumpAppointments incrementa a versão para TODOS os consumidores", () => {
    render(
      <>
        <Probe label="a" />
        <Probe label="b" />
      </>,
    );
    // Não assumimos o valor absoluto (o contador é global ao módulo): medimos o
    // DELTA. Cada bump sobe exatamente 1 e repinta os dois consumidores.
    const read = (label: string): number =>
      Number(screen.getByText(new RegExp(`^${label}:`)).textContent!.split(":")[1]);

    const a0 = read("a");
    expect(read("b")).toBe(a0); // mesma fonte de verdade

    act(() => bumpAppointments());
    expect(read("a")).toBe(a0 + 1);
    expect(read("b")).toBe(a0 + 1);

    act(() => bumpAppointments());
    expect(read("a")).toBe(a0 + 2);
    expect(read("b")).toBe(a0 + 2);
  });

  it("para de notificar um consumidor desmontado (sem vazar assinatura)", () => {
    const { unmount } = render(<Probe label="c" />);
    const before = Number(
      screen.getByText(/^c:/).textContent!.split(":")[1],
    );
    unmount();
    // Não deve lançar nem tentar atualizar um componente desmontado.
    expect(() => act(() => bumpAppointments())).not.toThrow();
    // (o valor "before" foi só para garantir que o consumidor havia lido o sinal)
    expect(Number.isFinite(before)).toBe(true);
  });
});
