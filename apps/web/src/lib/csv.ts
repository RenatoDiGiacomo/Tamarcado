/**
 * Geração/baixa de CSV no cliente (Story 5.4). Fica em `lib/` para ser
 * REUTILIZÁVEL — o Financeiro exporta os recebimentos hoje; o Dashboard
 * reaproveita depois. PDF ficou FORA do escopo (correção do DL-061): CSV abre
 * direto no Excel. Convenção BR: separador `;` e decimal com vírgula.
 */

/** Escapa um campo: aspas quando há separador, aspas ou quebra de linha. */
function escapeField(value: string | number, separator: string): string {
  const s = String(value);
  if (s.includes(separator) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Monta o texto CSV a partir do cabeçalho e das linhas (RFC-4180, CRLF). */
export function toCsv(
  headers: string[],
  rows: (string | number)[][],
  separator = ";",
): string {
  return [headers, ...rows]
    .map((row) => row.map((c) => escapeField(c, separator)).join(separator))
    .join("\r\n");
}

/** Número BR para célula de moeda: 50 → "50,00" (decimal com vírgula). */
export function csvAmount(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * Dispara o download do CSV. BOM (U+FEFF) para o Excel reconhecer UTF-8 e não
 * quebrar acentos. Cria um `<a download>` temporário e revoga a URL depois.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([String.fromCharCode(0xfeff) + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
