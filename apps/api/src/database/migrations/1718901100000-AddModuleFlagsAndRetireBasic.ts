import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 5.1 (DL-062). Fundação de permissões:
 * 1. Três flags por usuário (visibilidade de MÓDULO + escopo de AÇÃO da Agenda),
 *    ADITIVOS e OFF por padrão — usuários existentes ficam sem nada (o `owner`
 *    ignora os flags no código).
 * 2. Aposenta o papel `basic` (DL-062): converte os existentes em `manager`
 *    (dado) ANTES de estreitar o enum, em `users` e `user_invites`. O que o
 *    `basic` restringia virou a AUSÊNCIA de `can_manage_all_appointments`.
 */
export class AddModuleFlagsAndRetireBasic1718901100000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Flags (tinyint = boolean no TypeORM/mysql), OFF por padrão.
    await queryRunner.query(
      "ALTER TABLE `users` ADD `can_view_financeiro` TINYINT NOT NULL DEFAULT 0",
    );
    await queryRunner.query(
      "ALTER TABLE `users` ADD `can_view_dashboard` TINYINT NOT NULL DEFAULT 0",
    );
    await queryRunner.query(
      "ALTER TABLE `users` ADD `can_manage_all_appointments` TINYINT NOT NULL DEFAULT 0",
    );

    // 2) Converte 'basic' → 'manager' (dado) antes de estreitar o enum.
    await queryRunner.query(
      "UPDATE `users` SET `access_level` = 'manager' WHERE `access_level` = 'basic'",
    );
    await queryRunner.query(
      "UPDATE `user_invites` SET `access_level` = 'manager' WHERE `access_level` = 'basic'",
    );

    // 3) Estreita os enums para ('owner','manager').
    await queryRunner.query(
      "ALTER TABLE `users` MODIFY `access_level` ENUM('owner','manager') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `user_invites` MODIFY `access_level` ENUM('owner','manager') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaura o enum com 'basic' (dados convertidos NÃO voltam — irreversível
    // por natureza; a coluna volta a aceitar o valor).
    await queryRunner.query(
      "ALTER TABLE `user_invites` MODIFY `access_level` ENUM('owner','manager','basic') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `users` MODIFY `access_level` ENUM('owner','manager','basic') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `users` DROP COLUMN `can_manage_all_appointments`",
    );
    await queryRunner.query(
      "ALTER TABLE `users` DROP COLUMN `can_view_dashboard`",
    );
    await queryRunner.query(
      "ALTER TABLE `users` DROP COLUMN `can_view_financeiro`",
    );
  }
}
