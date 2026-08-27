import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Nome informado na solicitação pública (DL-071).
 *
 * O link público reaproveita a cliente pelo telefone normalizado (dedup) e
 * IGNORA o nome digitado — certo para não duplicar cadastro, errado quando a
 * divergência some: a filha agenda pelo telefone da mãe, ou a cliente mudou de
 * nome, e quem confirma nunca fica sabendo.
 *
 * A coluna guarda o nome COMO FOI DIGITADO, sempre — é snapshot da solicitação,
 * na mesma lógica de `price_snapshot`/`duration_minutes`. Quem decide o que
 * mostrar é a view (`nomeInformadoDivergente`): assim a regra de exibição pode
 * mudar depois sem ter perdido o dado.
 *
 * ADITIVO e NULL: agendamento manual/bot e as solicitações antigas ficam sem —
 * `NULL` significa "não há nome informado a comparar", não divergência.
 *
 * 100 caracteres = o `@MaxLength(100)` do `CreatePublicAppointmentDto`.
 */
export class AddRequestedClientNameToAppointments1718901800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `appointments` ADD `requested_client_name` VARCHAR(100) NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `appointments` DROP COLUMN `requested_client_name`",
    );
  }
}
