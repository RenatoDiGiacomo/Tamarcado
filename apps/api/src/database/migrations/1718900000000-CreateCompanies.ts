import { MigrationInterface, QueryRunner, Table } from "typeorm";

/**
 * Migration inicial — cria apenas a tabela `companies` (AC3, architecture.md §3.1).
 *
 * Escopo deliberado:
 * - NÃO cria outras tabelas (users, clients, appointments...) — ordem DL-020.
 * - NÃO cria `whatsapp_provider` nem `evolution_instance_name` — adicionadas
 *   na Story 2.1.
 */
export class CreateCompanies1718900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "companies",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "name", type: "varchar", length: "100", isNullable: false },
          {
            name: "slug",
            type: "varchar",
            length: "50",
            isNullable: false,
            isUnique: true,
          },
          { name: "logo_url", type: "varchar", length: "500", isNullable: true },
          {
            name: "primary_color",
            type: "varchar",
            length: "7",
            isNullable: true,
            default: "'#6C63FF'",
          },
          {
            name: "business_hours_start",
            type: "time",
            isNullable: false,
            default: "'08:00:00'",
          },
          {
            name: "business_hours_end",
            type: "time",
            isNullable: false,
            default: "'19:00:00'",
          },
          {
            // architecture.md §3.1 indica length 20, mas o default tem 23
            // chars — corrigido para 50 (spec internamente inconsistente).
            name: "business_days",
            type: "varchar",
            length: "50",
            isNullable: false,
            default: "'mon,tue,wed,thu,fri,sat'",
          },
          {
            name: "timezone",
            type: "varchar",
            length: "50",
            isNullable: false,
            default: "'America/Sao_Paulo'",
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("companies");
  }
}
