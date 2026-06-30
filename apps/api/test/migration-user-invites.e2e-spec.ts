import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Verifica a migration `user_invites` (Story 1.4, DL-029): colunas exigidas,
 * token único, FK para companies e reversão limpa. Requer MySQL.
 */
describe("Migration CreateUserInvites (e2e)", () => {
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

  it("cria user_invites com as colunas do convite", async () => {
    const columns: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_invites'`,
    );
    expect(columns.map((c) => c.COLUMN_NAME)).toEqual(
      expect.arrayContaining([
        "id",
        "company_id",
        "email",
        "name",
        "access_level",
        "attends_clients",
        "token_hash",
        "expires_at",
        "accepted_at",
        "invited_by",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("tem índice único de token (lookup do aceite)", async () => {
    const idx: Array<{ COLUMN_NAME: string; NON_UNIQUE: number | string }> =
      await ds.query(
      `SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_invites'
         AND INDEX_NAME = 'uq_user_invites_token'`,
    );
    expect(idx.map((i) => i.COLUMN_NAME)).toEqual(["token_hash"]);
    // information_schema.NON_UNIQUE (BIGINT) volta como string via TypeORM/mysql2.
    expect(idx.every((i) => Number(i.NON_UNIQUE) === 0)).toBe(true);
  });

  it("tem FK company_id → companies", async () => {
    const fks: Array<{ CONSTRAINT_NAME: string }> = await ds.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_invites'
         AND REFERENCED_TABLE_NAME = 'companies'`,
    );
    expect(fks.length).toBeGreaterThan(0);
  });

  it("reverte a migration removendo a tabela user_invites", async () => {
    await ds.undoLastMigration(); // user_invites é a última migration
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_invites'`,
    );
    expect(tables).toHaveLength(0);
  });
});
