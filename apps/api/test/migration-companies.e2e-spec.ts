import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Verifica que a migration inicial cria a tabela `companies` com as colunas
 * mínimas exigidas pela AC3 (Story 1.1) e que reverte limpo. Requer MySQL.
 * Nota: a partir da Story 1.2 existe também a migration `users`; este teste
 * usa reset FK-safe e valida apenas o que diz respeito a `companies`.
 */
describe("Migration CreateCompanies (e2e)", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await createTestDataSource();
    await resetSchema(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await dropSchema(ds);
      await ds.destroy();
    }
  });

  it("cria companies com id, name, timezone (default), created_at", async () => {
    const columns: Array<{ COLUMN_NAME: string; COLUMN_DEFAULT: string | null }> =
      await ds.query(
        `SELECT COLUMN_NAME, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'`,
      );
    const names = columns.map((c) => c.COLUMN_NAME);
    expect(names).toEqual(
      expect.arrayContaining(["id", "name", "timezone", "created_at"]),
    );
    const tz = columns.find((c) => c.COLUMN_NAME === "timezone");
    expect(tz?.COLUMN_DEFAULT).toBe("America/Sao_Paulo");
  });

  it("não cria tabelas de épicos futuros", async () => {
    // Já existem: `salon_services`/`professional_services` (1.5),
    // `professional_schedules` (1.6), `clients`/`appointments` (3.1). As de
    // baixo ainda não: `payments` (Épico 5) e `whatsapp_conversations` (Épico 6).
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('payments','whatsapp_conversations')`,
    );
    expect(tables).toHaveLength(0);
  });

  it("reverte todas as migrations removendo a tabela companies", async () => {
    // Reverte TODAS as migrations (imune a novas) — companies é a primeira.
    for (let i = 0; i < ds.migrations.length; i++) {
      await ds.undoLastMigration();
    }
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'`,
    );
    expect(tables).toHaveLength(0);
  });
});
