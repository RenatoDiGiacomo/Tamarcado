import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";

/**
 * Cria `professional_schedules` (architecture.md §3.6, Story 1.6) e adiciona
 * `users.slot_interval_minutes` (intervalo por profissional — DL-032).
 * FKs para `users` e `companies`; índice liderado por `company_id`.
 */
export class CreateProfessionalSchedules1718900400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "professional_schedules",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "company_id", type: "bigint", isNullable: false },
          { name: "professional_id", type: "bigint", isNullable: false },
          { name: "day_of_week", type: "tinyint", isNullable: false },
          { name: "start_time", type: "time", isNullable: false },
          { name: "end_time", type: "time", isNullable: false },
          {
            name: "is_active",
            type: "boolean",
            isNullable: false,
            default: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices("professional_schedules", [
      new TableIndex({
        name: "idx_pschedules_company_prof_day",
        columnNames: ["company_id", "professional_id", "day_of_week"],
      }),
    ]);

    await queryRunner.createForeignKeys("professional_schedules", [
      new TableForeignKey({
        name: "fk_pschedules_professional",
        columnNames: ["professional_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
      new TableForeignKey({
        name: "fk_pschedules_company",
        columnNames: ["company_id"],
        referencedTableName: "companies",
        referencedColumnNames: ["id"],
      }),
    ]);

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "slot_interval_minutes",
        type: "int",
        isNullable: false,
        default: 0,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "slot_interval_minutes");
    await queryRunner.dropTable("professional_schedules"); // remove FKs/índices junto
  }
}
