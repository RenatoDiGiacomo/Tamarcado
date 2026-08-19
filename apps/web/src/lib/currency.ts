/**
 * Moeda brasileira (Story 5.2). `brl` formata um número; `maskBRL`/`brlToNumber`
 * fazem a máscara do campo — a pessoa digita dígitos e os centavos preenchem da
 * direita para a esquerda ("5000" → "R$ 50,00").
 */

export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Reformata o texto do input como moeda a cada tecla (centavos da direita). */
export function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  const cents = parseInt(digits, 10);
  return brl(cents / 100);
}

/** Extrai o número de um valor mascarado ("R$ 50,00" → 50). */
export function brlToNumber(masked: string): number {
  const digits = masked.replace(/\D/g, "");
  return digits === "" ? 0 : parseInt(digits, 10) / 100;
}
