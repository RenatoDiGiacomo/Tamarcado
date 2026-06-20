// Types e DTOs compartilhados entre apps/api, apps/web e apps/mobile.
// Semente do walking skeleton — expandido nas stories seguintes.

/**
 * Identificador de tenant (companies.id).
 * A PK é `BIGINT` (architecture.md §3.1) e o TypeORM a mapeia para `string`
 * em JS para evitar perda de precisão — por isso `string`, não `number`.
 * Comparações de tenant (NFR-S1) devem usar este tipo consistentemente.
 */
export type CompanyId = string;

/** Resposta do endpoint GET /health da API. */
export interface HealthStatus {
  status: "ok";
}
