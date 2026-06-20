// Types e DTOs compartilhados entre apps/api, apps/web e apps/mobile.
// Semente do walking skeleton — expandido nas stories seguintes.

/** Identificador de tenant (companies.id). */
export type CompanyId = number;

/** Resposta do endpoint GET /health da API. */
export interface HealthStatus {
  status: "ok";
}
