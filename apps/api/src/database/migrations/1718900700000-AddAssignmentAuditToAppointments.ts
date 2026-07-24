import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from "typeorm";

/**
 * Story 3.5 — atribuir/trocar profissional (DL-043). Rastro de AUTORIA da
 * atribuição, espelhando `cancelled_by_user_id` (3.4): `assigned_by_user_id`
 * guarda QUEM alterou o profissional e `assigned_at` QUANDO. Ambas nullable
 * (agendamento nunca teve o profissional trocado = NULL). Sem índice: auditoria
 * não é caminho quente.
 */
export class AddAssignmentAuditToAppointments1718900700000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "appointments",
      new TableColumn({
        name: "assigned_by_user_id",
        type: "bigint",
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      "appointments",
      new TableColumn({
        name: "assigned_at",
        type: "datetime",
        isNullable: true,
      }),
    );
    await queryRunner.createForeignKey(
      "appointments",
      new TableForeignKey({
        name: "fk_apt_assigned_by_user",
        columnNames: ["assigned_by_user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey("appointments", "fk_apt_assigned_by_user");
    await queryRunner.dropColumn("appointments", "assigned_at");
    await queryRunner.dropColumn("appointments", "assigned_by_user_id");
  }
}
