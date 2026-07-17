/**
 * Normaliza um telefone brasileiro para E.164 (`+55DDDNÚMERO`) — usado como
 * `phone_whatsapp_normalized` para matching/deduplicação de clientes (§3.3).
 * Retorna `null` para vazio/nulo (cliente sem WhatsApp é permitido — a UNIQUE
 * é NULL-safe). Base reutilizável pela Story 3.3 (cadastro inline), Épico 4 e o bot.
 */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Já com código do país (55): 12 dígitos (fixo) ou 13 (móvel c/ 9).
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  // Número nacional (DDD + 8/9 dígitos) → prefixa +55.
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  // Fora dos formatos esperados: preserva os dígitos em E.164 best-effort
  // (melhor guardar algo comparável do que descartar).
  return `+${digits}`;
}
