import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Verifica a migration `salon_services` + `professional_services` (Story 1.5):
 * colunas, price NULLABLE (DL-030), índices por company_id, FKs e reversão.
 * Requer MySQL.
 */
// resetSchema no beforeAll passa de 5s sob carga do CI (evita flake do hook de 5000ms).
jest.setTimeout(60000);

describe("Migration CreateServices (e2e)", () => {
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

  it("cria salon_services com price NULLABLE (DL-030)", async () => {
    const columns: Array<{ COLUMN_NAME: string; IS_NULLABLE: string }> =
      await ds.query(
        `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salon_services'`,
      );
    expect(columns.map((c) => c.COLUMN_NAME)).toEqual(
      expect.arrayContaining([
        "id",
        "company_id",
        "name",
        "duration_minutes",
        "price",
        "is_active",
        "created_at",
        "updated_at",
      ]),
    );
    const price = columns.find((c) => c.COLUMN_NAME === "price");
    expect(price?.IS_NULLABLE).toBe("YES");
  });

  it("cria professional_services com PK composta e FKs", async () => {
    const pk: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_services'
         AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`,
    );
    expect(pk.map((c) => c.COLUMN_NAME)).toEqual([
      "professional_id",
      "service_id",
    ]);

    const fks: Array<{ REFERENCED_TABLE_NAME: string }> = await ds.query(
      `SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_services'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    const refs = fks.map((f) => f.REFERENCED_TABLE_NAME);
    expect(refs).toEqual(expect.arrayContaining(["users", "salon_services"]));
  });

  it("salon_services tem índice liderado por company_id", async () => {
    const idx: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salon_services'
         AND INDEX_NAME = 'idx_services_company_active'
       ORDER BY SEQ_IN_INDEX`,
    );
    expect(idx[0]?.COLUMN_NAME).toBe("company_id");
  });

  it("reverte removendo salon_services e professional_services", async () => {
    // Reverte TODAS as migrations (imune a novas) e confirma que somem.
    for (let i = 0; i < ds.migrations.length; i++) {
      await ds.undoLastMigration();
    }
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('salon_services','professional_services')`,
    );
    expect(tables).toHaveLength(0);
  });
});
