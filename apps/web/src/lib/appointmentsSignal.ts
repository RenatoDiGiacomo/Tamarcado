import { useSyncExternalStore } from "react";

/**
 * Sinal global de "os agendamentos mudaram" (Story 7.3 §5). TODA mutação de
 * agendamento — confirmar/cancelar/marcar/remarcar na Agenda E confirmar/recusar
 * em Pendentes — chama `bumpAppointments()`. Quem depende dos dados (a Agenda:
 * lista do dia + mapa de status do mês) observa `useAppointmentsVersion()` e
 * recarrega. Assim o mesmo tratamento vale para mutações que vivem fora do
 * `useAgenda` (ex.: o "Recusar" da tela Pendentes), sem acoplar as telas.
 */
let version = 0;
const listeners = new Set<() => void>();

/** Sinaliza que algum agendamento mudou → todos os observadores recarregam. */
export function bumpAppointments(): void {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Versão atual do sinal — muda a cada `bumpAppointments()`. */
export function useAppointmentsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
