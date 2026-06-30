import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

/**
 * Cria `salon_services` e `professional_services` (Story 1.5, DL-020/DL-030).
 * - `salon_services.price` é NULL (opcional — DL-030).
 * - `professional_services`: PK composta + FKs para users e salon_services.
 * Índices liderados por `company_id`. Ordem de drop FK-safe no `down`.
 */
export class CreateServices1718900300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "salon_services",
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
          { name: "duration_minutes", type: "int", isNullable: false },
          {
            name: "price",
            type: "decimal",
            precision: 10,
            scale: 2,
            isNullable: true,
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

    await queryRunner.createIndices("salon_services", [
      new TableIndex({
        name: "idx_services_company_active",
        columnNames: ["company_id", "is_active"],
      }),
    ]);

    await queryRunner.createForeignKey(
      "salon_services",
      new TableForeignKey({
        name: "fk_services_company",
        columnNames: ["company_id"],
        referencedTableName: "companies",
        referencedColumnNames: ["id"],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: "professional_services",
        columns: [
          { name: "professional_id", type: "bigint", isPrimary: true },
          { name: "service_id", type: "bigint", isPrimary: true },
          { name: "company_id", type: "bigint", isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createIndices("professional_services", [
      new TableIndex({
        name: "idx_prof_services_company_service",
        columnNames: ["company_id", "service_id"],
      }),
    ]);

    await queryRunner.createForeignKeys("professional_services", [
      new TableForeignKey({
        name: "fk_ps_professional",
        columnNames: ["professional_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
      new TableForeignKey({
        name: "fk_ps_service",
        columnNames: ["service_id"],
        referencedTableName: "salon_services",
        referencedColumnNames: ["id"],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("professional_services"); // filha — primeiro
    await queryRunner.dropTable("salon_services");
  }
}
