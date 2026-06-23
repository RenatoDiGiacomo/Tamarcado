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
    // `users` é legítima a partir da Story 1.2; as demais não devem existir.
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('clients','appointments','salon_services',
                            'professional_services','professional_schedules',
                            'payments','whatsapp_conversations')`,
    );
    expect(tables).toHaveLength(0);
  });

  it("reverte todas as migrations removendo a tabela companies", async () => {
    // Desfaz users e depois companies (ordem reversa das migrations).
    await ds.undoLastMigration();
    await ds.undoLastMigration();
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'`,
    );
    expect(tables).toHaveLength(0);
  });
});
