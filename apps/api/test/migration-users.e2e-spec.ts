import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Verifica a migration `users` (AC1): colunas exigidas, enums, unique por
 * tenant (DL-026), FK para companies, e reversão limpa. Requer MySQL.
 */
describe("Migration CreateUsers (e2e)", () => {
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

  it("cria users com as colunas da AC1", async () => {
    const columns: Array<{ COLUMN_NAME: string; COLUMN_DEFAULT: string | null }> =
      await ds.query(
        `SELECT COLUMN_NAME, COLUMN_DEFAULT FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
      );
    const names = columns.map((c) => c.COLUMN_NAME);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "company_id",
        "name",
        "email",
        "password_hash",
        "access_level",
        "attends_clients",
        "theme",
        "is_active",
        "created_at",
        "updated_at",
      ]),
    );
    const theme = columns.find((c) => c.COLUMN_NAME === "theme");
    expect(theme?.COLUMN_DEFAULT).toBe("light");
  });

  it("tem unique composto (company_id, email) — email por tenant (DL-026)", async () => {
    const idx: Array<{ INDEX_NAME: string; COLUMN_NAME: string; NON_UNIQUE: number }> =
      await ds.query(
        `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND INDEX_NAME = 'uq_users_tenant_email' ORDER BY SEQ_IN_INDEX`,
      );
    expect(idx.map((i) => i.COLUMN_NAME)).toEqual(["company_id", "email"]);
    expect(idx.every((i) => i.NON_UNIQUE === 0)).toBe(true);
  });

  it("tem FK company_id → companies", async () => {
    const fks: Array<{ CONSTRAINT_NAME: string }> = await ds.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
         AND REFERENCED_TABLE_NAME = 'companies'`,
    );
    expect(fks.length).toBeGreaterThan(0);
  });

  it("reverte a migration removendo a tabela users", async () => {
    await ds.undoLastMigration();
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`,
    );
    expect(tables).toHaveLength(0);
  });
});
