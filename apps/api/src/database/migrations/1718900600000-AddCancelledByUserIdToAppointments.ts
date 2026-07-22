import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from "typeorm";

/**
 * Story 3.4 — cancelamento pelo painel (D1). Rastro de AUTORIA do cancelamento:
 * `cancelled_by` (já existente) guarda o LADO (salão/cliente/sistema, usado pelo
 * bot na 6.6); esta coluna guarda a PESSOA que cancelou. Nullable e espelha
 * `created_by_user_id` (mesmo FK para `users`). Sem índice: consulta por autor
 * não é caminho quente.
 */
export class AddCancelledByUserIdToAppointments1718900600000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "appointments",
      new TableColumn({
        name: "cancelled_by_user_id",
        type: "bigint",
        isNullable: true,
      }),
    );
    await queryRunner.createForeignKey(
      "appointments",
      new TableForeignKey({
        name: "fk_apt_cancelled_by_user",
        columnNames: ["cancelled_by_user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey("appointments", "fk_apt_cancelled_by_user");
    await queryRunner.dropColumn("appointments", "cancelled_by_user_id");
  }
}
