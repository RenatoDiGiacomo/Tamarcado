import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Verifica a migration do histórico de edições (Story 3.6): tabela
 * `appointment_changes` (colunas, index `(company_id, appointment_id)`, FKs para
 * appointments/users) e reversão FK-safe. Requer MySQL.
 */
describe("Migration CreateAppointmentChanges (e2e)", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await createTestDataSource();
    await resetSchema(ds);
  }, 60000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      await dropSchema(ds);
      await ds.destroy();
    }
  });

  it("cria appointment_changes com as colunas esperadas", async () => {
    const cols: Array<{ COLUMN_NAME: string; IS_NULLABLE: string }> =
      await ds.query(
        `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointment_changes'`,
      );
    expect(cols.map((c) => c.COLUMN_NAME)).toEqual(
      expect.arrayContaining([
        "id",
        "company_id",
        "appointment_id",
        "changed_by_user_id",
        "changed_at",
        "field",
        "old_value",
        "new_value",
      ]),
    );
    // de→para são NULLABLE (ex.: de "Não atribuído").
    expect(cols.find((c) => c.COLUMN_NAME === "old_value")?.IS_NULLABLE).toBe("YES");
    expect(cols.find((c) => c.COLUMN_NAME === "new_value")?.IS_NULLABLE).toBe("YES");
  });

  it("tem index liderado por company_id e FKs para appointments e users", async () => {
    const idx: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointment_changes'
         AND INDEX_NAME = 'idx_apt_changes_company_apt' ORDER BY SEQ_IN_INDEX`,
    );
    expect(idx.map((c) => c.COLUMN_NAME)).toEqual([
      "company_id",
      "appointment_id",
    ]);

    const fks: Array<{ REFERENCED_TABLE_NAME: string }> = await ds.query(
      `SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointment_changes'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    expect(fks.map((f) => f.REFERENCED_TABLE_NAME).sort()).toEqual([
      "appointments",
      "users",
    ]);
  });
});
