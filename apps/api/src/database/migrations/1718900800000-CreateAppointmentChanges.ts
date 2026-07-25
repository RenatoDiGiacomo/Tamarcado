import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

/**
 * Story 3.6 — histórico de edições de agendamento (DL-044/DL-045). Registro
 * simples de alteração (append-only): uma linha por CAMPO alterado numa edição,
 * com de→para, quem e quando. NÃO é versionamento do agendamento inteiro; é o que
 * esclarece reclamação ("eu marquei às 14h"). Genérica por `field` de propósito
 * (DL-045: cancelamento/atribuição poderiam migrar para cá no futuro).
 */
export class CreateAppointmentChanges1718900800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "appointment_changes",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "company_id", type: "bigint" },
          { name: "appointment_id", type: "bigint" },
          { name: "changed_by_user_id", type: "bigint" },
          { name: "changed_at", type: "datetime" },
          { name: "field", type: "varchar", length: "32" },
          { name: "old_value", type: "varchar", length: "255", isNullable: true },
          { name: "new_value", type: "varchar", length: "255", isNullable: true },
        ],
      }),
    );

    await queryRunner.createIndex(
      "appointment_changes",
      new TableIndex({
        name: "idx_apt_changes_company_apt",
        columnNames: ["company_id", "appointment_id"],
      }),
    );

    await queryRunner.createForeignKey(
      "appointment_changes",
      new TableForeignKey({
        name: "fk_apt_changes_appointment",
        columnNames: ["appointment_id"],
        referencedTableName: "appointments",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );
    await queryRunner.createForeignKey(
      "appointment_changes",
      new TableForeignKey({
        name: "fk_apt_changes_user",
        columnNames: ["changed_by_user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("appointment_changes");
  }
}
