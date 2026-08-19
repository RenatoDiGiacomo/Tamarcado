// Utilitários puros, sem dependência de framework.
// Compartilhados entre apps/api e apps/web.

/**
 * Retorna true se o valor for null, undefined ou string composta só por
 * espaços em branco. Base para validações de campos opcionais.
 */
export function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}
