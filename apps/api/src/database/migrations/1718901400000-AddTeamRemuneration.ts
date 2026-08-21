import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 5.9 (2ª leva, DL-061). Cadastro de remuneração da Equipe:
 * 1. `users` ganha o salário fixo (valor + cadência) e a comissão por PROFISSIONAL
 *    (escopo/tipo/valor). ADITIVO — usuários existentes ficam sem remuneração
 *    (`commission_scope='none'`, salário nulo).
 * 2. `professional_services` ganha a comissão por SERVIÇO (tipo/valor) — usada
 *    quando o profissional tem `commission_scope='service'`.
 * Fixo e comissão coexistem; a comissão é apurada por atendimento CONCLUÍDO (código).
 */
export class AddTeamRemuneration1718901400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `users` ADD `salary_amount` DECIMAL(10,2) NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `users` ADD `salary_cadence` ENUM('daily','weekly','monthly') NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `users` ADD `commission_scope` ENUM('none','professional','service') NOT NULL DEFAULT 'none'",
    );
    await queryRunner.query(
      "ALTER TABLE `users` ADD `commission_kind` ENUM('percent','fixed') NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `users` ADD `commission_value` DECIMAL(10,2) NULL",
    );

    await queryRunner.query(
      "ALTER TABLE `professional_services` ADD `commission_kind` ENUM('percent','fixed') NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `professional_services` ADD `commission_value` DECIMAL(10,2) NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `professional_services` DROP COLUMN `commission_value`",
    );
    await queryRunner.query(
      "ALTER TABLE `professional_services` DROP COLUMN `commission_kind`",
    );
    await queryRunner.query("ALTER TABLE `users` DROP COLUMN `commission_value`");
    await queryRunner.query("ALTER TABLE `users` DROP COLUMN `commission_kind`");
    await queryRunner.query("ALTER TABLE `users` DROP COLUMN `commission_scope`");
    await queryRunner.query("ALTER TABLE `users` DROP COLUMN `salary_cadence`");
    await queryRunner.query("ALTER TABLE `users` DROP COLUMN `salary_amount`");
  }
}
