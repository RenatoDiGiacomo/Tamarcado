import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

/**
 * Story 3.1 — base de agendamento (architecture.md §3.3/§3.7). Cria `clients`
 * (base) e depois `appointments` (ordem DL-020: clients antes de appointments).
 * Schema completo de `appointments` desde já (DL-038 D5) — colunas do bot inclusas.
 * `professional_id` e `price_snapshot` nullable (C.4-bis / DL-038 D1).
 */
export class CreateAppointmentsBase1718900500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- clients (base) ---
    await queryRunner.createTable(
      new Table({
        name: "clients",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "company_id", type: "bigint", isNullable: false },
          { name: "name", type: "varchar", length: "100", isNullable: false },
          {
            name: "phone_whatsapp",
            type: "varchar",
            length: "20",
            isNullable: true,
          },
          {
            name: "phone_whatsapp_normalized",
            type: "varchar",
            length: "20",
            isNullable: true,
          },
          { name: "notes", type: "text", isNullable: true },
          {
            name: "is_deleted",
            type: "boolean",
            isNullable: false,
            default: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices("clients", [
      // UNIQUE NULL-safe: dois clientes sem WhatsApp (NULL) não conflitam.
      new TableIndex({
        name: "uq_clients_tenant_phone",
        columnNames: ["company_id", "phone_whatsapp_normalized"],
        isUnique: true,
      }),
      new TableIndex({
        name: "idx_clients_company_name",
        columnNames: ["company_id", "name"],
      }),
      new TableIndex({
        name: "idx_clients_company_deleted",
        columnNames: ["company_id", "is_deleted"],
      }),
    ]);

    await queryRunner.createForeignKeys("clients", [
      new TableForeignKey({
        name: "fk_clients_company",
        columnNames: ["company_id"],
        referencedTableName: "companies",
        referencedColumnNames: ["id"],
      }),
    ]);

    // --- appointments ---
    await queryRunner.createTable(
      new Table({
        name: "appointments",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "company_id", type: "bigint", isNullable: false },
          { name: "client_id", type: "bigint", isNullable: false },
          { name: "service_id", type: "bigint", isNullable: false },
          { name: "professional_id", type: "bigint", isNullable: true },
          { name: "scheduled_at", type: "datetime", isNullable: false },
          { name: "duration_minutes", type: "int", isNullable: false },
          {
            name: "price_snapshot",
            type: "decimal",
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: "status",
            type: "enum",
            enum: ["pending", "confirmed", "cancelled", "completed", "no_show"],
            isNullable: false,
          },
          {
            name: "source",
            type: "enum",
            enum: ["whatsapp", "manual", "app"],
            isNullable: false,
          },
          { name: "created_by_user_id", type: "bigint", isNullable: true },
          { name: "cancellation_reason", type: "text", isNullable: true },
          {
            name: "cancelled_by",
            type: "enum",
            enum: ["client", "professional", "system"],
            isNullable: true,
          },
          { name: "timeout_notified_at", type: "datetime", isNullable: true },
          {
            name: "is_deleted",
            type: "boolean",
            isNullable: false,
            default: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices("appointments", [
      new TableIndex({
        name: "idx_apt_company_date",
        columnNames: ["company_id", "scheduled_at"],
      }),
      new TableIndex({
        name: "idx_apt_company_status_date",
        columnNames: ["company_id", "status", "scheduled_at"],
      }),
      new TableIndex({
        name: "idx_apt_company_prof_date",
        columnNames: ["company_id", "professional_id", "scheduled_at"],
      }),
      new TableIndex({
        name: "idx_apt_company_client",
        columnNames: ["company_id", "client_id"],
      }),
      new TableIndex({
        name: "idx_apt_company_source",
        columnNames: ["company_id", "source"],
      }),
    ]);

    await queryRunner.createForeignKeys("appointments", [
      new TableForeignKey({
        name: "fk_apt_company",
        columnNames: ["company_id"],
        referencedTableName: "companies",
        referencedColumnNames: ["id"],
      }),
      new TableForeignKey({
        name: "fk_apt_client",
        columnNames: ["client_id"],
        referencedTableName: "clients",
        referencedColumnNames: ["id"],
      }),
      new TableForeignKey({
        name: "fk_apt_service",
        columnNames: ["service_id"],
        referencedTableName: "salon_services",
        referencedColumnNames: ["id"],
      }),
      new TableForeignKey({
        name: "fk_apt_professional",
        columnNames: ["professional_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
      new TableForeignKey({
        name: "fk_apt_created_by",
        columnNames: ["created_by_user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Ordem inversa (FK-safe): appointments antes de clients.
    await queryRunner.dropTable("appointments"); // remove FKs/índices junto
    await queryRunner.dropTable("clients");
  }
}
