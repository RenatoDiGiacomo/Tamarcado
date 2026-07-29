import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Verifica a migration `professional_schedules` + `users.slot_interval_minutes`
 * (Story 1.6, DL-032): colunas, índice por company_id, FKs (users, companies),
 * coluna de intervalo e reversão. Requer MySQL.
 */
// resetSchema no beforeAll passa de 5s sob carga do CI (evita flake do hook de 5000ms).
jest.setTimeout(60000);

describe("Migration CreateProfessionalSchedules (e2e)", () => {
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

  it("cria professional_schedules com as colunas do §3.6", async () => {
    const columns: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_schedules'`,
    );
    expect(columns.map((c) => c.COLUMN_NAME)).toEqual(
      expect.arrayContaining([
        "id",
        "company_id",
        "professional_id",
        "day_of_week",
        "start_time",
        "end_time",
        "is_active",
      ]),
    );
  });

  it("tem FKs para users e companies", async () => {
    const fks: Array<{ REFERENCED_TABLE_NAME: string }> = await ds.query(
      `SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_schedules'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    expect(fks.map((f) => f.REFERENCED_TABLE_NAME)).toEqual(
      expect.arrayContaining(["users", "companies"]),
    );
  });

  it("índice liderado por company_id", async () => {
    const idx: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_schedules'
         AND INDEX_NAME = 'idx_pschedules_company_prof_day'
       ORDER BY SEQ_IN_INDEX`,
    );
    expect(idx[0]?.COLUMN_NAME).toBe("company_id");
  });

  it("adiciona users.slot_interval_minutes (default 0, NOT NULL)", async () => {
    const col: Array<{ IS_NULLABLE: string; COLUMN_DEFAULT: string | null }> =
      await ds.query(
        `SELECT IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'slot_interval_minutes'`,
      );
    expect(col).toHaveLength(1);
    expect(col[0].IS_NULLABLE).toBe("NO");
    expect(Number(col[0].COLUMN_DEFAULT)).toBe(0);
  });

  it("reverte removendo a tabela e a coluna de intervalo", async () => {
    // Reverte TODAS as migrations (imune a novas).
    for (let i = 0; i < ds.migrations.length; i++) {
      await ds.undoLastMigration();
    }
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'professional_schedules'`,
    );
    expect(tables).toHaveLength(0);
  });
});
