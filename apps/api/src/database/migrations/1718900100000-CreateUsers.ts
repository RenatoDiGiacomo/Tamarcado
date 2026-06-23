import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

/**
 * Cria a tabela `users` (architecture.md §3.2, ajustada por DL-026).
 * - Email único POR TENANT: `uq_users_tenant_email (company_id, email)`.
 * - FK `company_id → companies(id)` (tabela criada na Story 1.1).
 * Não cria outras tabelas; não introduz multi-tenancy (Story 1.3).
 */
export class CreateUsers1718900100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "users",
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
          { name: "email", type: "varchar", length: "200", isNullable: false },
          {
            name: "phone_whatsapp",
            type: "varchar",
            length: "20",
            isNullable: true,
          },
          {
            name: "password_hash",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          {
            name: "access_level",
            type: "enum",
            enum: ["owner", "manager", "basic"],
            isNullable: false,
          },
          {
            name: "attends_clients",
            type: "boolean",
            isNullable: false,
            default: false,
          },
          {
            name: "theme",
            type: "enum",
            enum: ["light", "dark"],
            isNullable: false,
            default: "'light'",
          },
          {
            name: "is_active",
            type: "boolean",
            isNullable: false,
            default: true,
          },
          {
            name: "created_at",
            type: "timestamp",
            isNullable: false,
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            isNullable: false,
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices("users", [
      new TableIndex({
        name: "uq_users_tenant_email",
        columnNames: ["company_id", "email"],
        isUnique: true,
      }),
      new TableIndex({
        name: "idx_users_company_access",
        columnNames: ["company_id", "access_level"],
      }),
      new TableIndex({
        name: "idx_users_company_attends",
        columnNames: ["company_id", "attends_clients"],
      }),
      new TableIndex({
        name: "idx_users_company_active",
        columnNames: ["company_id", "is_active"],
      }),
    ]);

    await queryRunner.createForeignKey(
      "users",
      new TableForeignKey({
        name: "fk_users_company",
        columnNames: ["company_id"],
        referencedTableName: "companies",
        referencedColumnNames: ["id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("users"); // remove FKs e índices junto
  }
}
