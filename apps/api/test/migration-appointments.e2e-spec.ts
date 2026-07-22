import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Verifica a migration da base de agendamento (Story 3.1): `clients` (base) e
 * `appointments` (schema completo). Colunas, nullables (professional_id,
 * price_snapshot), enums, índices por company_id, FKs, unicidade NULL-safe de
 * clients e reversão FK-safe. Requer MySQL.
 */
describe("Migration CreateAppointmentsBase (e2e)", () => {
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

  async function columns(
    table: string,
  ): Promise<Array<{ COLUMN_NAME: string; IS_NULLABLE: string; COLUMN_TYPE: string }>> {
    return ds.query(
      `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
  }

  it("cria clients com as colunas base", async () => {
    const cols = await columns("clients");
    expect(cols.map((c) => c.COLUMN_NAME)).toEqual(
      expect.arrayContaining([
        "id",
        "company_id",
        "name",
        "phone_whatsapp",
        "phone_whatsapp_normalized",
        "notes",
        "is_deleted",
        "created_at",
        "updated_at",
      ]),
    );
    // Cliente sem WhatsApp: telefone é nullable.
    expect(cols.find((c) => c.COLUMN_NAME === "phone_whatsapp")?.IS_NULLABLE).toBe(
      "YES",
    );
  });

  it("clients tem UNIQUE (company_id, phone_whatsapp_normalized) — NULL-safe", async () => {
    const idx: Array<{ COLUMN_NAME: string; NON_UNIQUE: string }> =
      await ds.query(
        `SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients'
           AND INDEX_NAME = 'uq_clients_tenant_phone' ORDER BY SEQ_IN_INDEX`,
      );
    expect(idx.map((c) => c.COLUMN_NAME)).toEqual([
      "company_id",
      "phone_whatsapp_normalized",
    ]);
    // NON_UNIQUE volta como string via TypeORM → Number(...); 0 = índice único.
    expect(Number(idx[0]?.NON_UNIQUE)).toBe(0);
  });

  it("cria appointments com o schema completo (incl. colunas do bot)", async () => {
    const cols = await columns("appointments");
    expect(cols.map((c) => c.COLUMN_NAME)).toEqual(
      expect.arrayContaining([
        "id",
        "company_id",
        "client_id",
        "service_id",
        "professional_id",
        "scheduled_at",
        "duration_minutes",
        "price_snapshot",
        "status",
        "source",
        "created_by_user_id",
        "cancellation_reason",
        "cancelled_by",
        "cancelled_by_user_id",
        "timeout_notified_at",
        "is_deleted",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("professional_id e price_snapshot são NULLABLE (C.4-bis / DL-038 D1)", async () => {
    const cols = await columns("appointments");
    expect(cols.find((c) => c.COLUMN_NAME === "professional_id")?.IS_NULLABLE).toBe(
      "YES",
    );
    expect(cols.find((c) => c.COLUMN_NAME === "price_snapshot")?.IS_NULLABLE).toBe(
      "YES",
    );
  });

  it("status e source são ENUM com os valores esperados", async () => {
    const cols = await columns("appointments");
    const status = cols.find((c) => c.COLUMN_NAME === "status")?.COLUMN_TYPE ?? "";
    const source = cols.find((c) => c.COLUMN_NAME === "source")?.COLUMN_TYPE ?? "";
    for (const v of ["pending", "confirmed", "cancelled", "completed", "no_show"]) {
      expect(status).toContain(v);
    }
    for (const v of ["whatsapp", "manual", "app"]) {
      expect(source).toContain(v);
    }
  });

  it("cancelled_by_user_id é NULLABLE (Story 3.4/D1 — autoria do cancelamento)", async () => {
    const cols = await columns("appointments");
    expect(
      cols.find((c) => c.COLUMN_NAME === "cancelled_by_user_id")?.IS_NULLABLE,
    ).toBe("YES");
  });

  it("appointments tem índices liderados por company_id e as 6 FKs", async () => {
    const idx: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments'
         AND INDEX_NAME = 'idx_apt_company_date' ORDER BY SEQ_IN_INDEX`,
    );
    expect(idx[0]?.COLUMN_NAME).toBe("company_id");

    const fks: Array<{ REFERENCED_TABLE_NAME: string }> = await ds.query(
      `SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments'
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    expect(fks.map((f) => f.REFERENCED_TABLE_NAME)).toEqual(
      expect.arrayContaining([
        "companies",
        "clients",
        "salon_services",
        "users",
      ]),
    );
    expect(fks).toHaveLength(6); // company, client, service, professional, created_by, cancelled_by_user
  });

  it("reverte removendo appointments e clients (FK-safe)", async () => {
    for (let i = 0; i < ds.migrations.length; i++) {
      await ds.undoLastMigration();
    }
    const tables: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('appointments','clients')`,
    );
    expect(tables).toHaveLength(0);
  });
});
