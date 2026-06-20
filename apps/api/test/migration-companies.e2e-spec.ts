import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "../src/database/data-source-options";

/**
 * Verifica que a migration inicial cria a tabela `companies` com as colunas
 * mínimas exigidas pela AC3 e que reverte limpo. Requer MySQL acessível
 * (CI: service container; local: docker compose up mysql).
 */
describe("Migration CreateCompanies (e2e)", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = new DataSource(buildDataSourceOptions());
    await ds.initialize();
    // estado limpo
    await ds.query("DROP TABLE IF EXISTS companies");
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query("DROP TABLE IF EXISTS companies");
      await ds.destroy();
    }
  });

  it("aplica a migration e cria companies com id, name, timezone, created_at", async () => {
    await ds.runMigrations();

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

  it("não cria tabelas além de companies", async () => {
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('users','clients','appointments','salon_services',
                            'professional_services','professional_schedules',
                            'payments','whatsapp_conversations')`,
    );
    expect(tables).toHaveLength(0);
  });

  it("reverte a migration removendo a tabela companies", async () => {
    await ds.undoLastMigration();
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'`,
    );
    expect(tables).toHaveLength(0);
  });
});
