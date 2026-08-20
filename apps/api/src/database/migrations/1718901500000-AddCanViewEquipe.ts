import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 5.9 (ajuste). Interruptor "Pode ver Equipe" (DL-062): a Equipe vira
 * módulo com visibilidade por pessoa (owner sempre pode). ADITIVO, OFF por padrão.
 */
export class AddCanViewEquipe1718901500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `users` ADD `can_view_equipe` TINYINT NOT NULL DEFAULT 0",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `users` DROP COLUMN `can_view_equipe`");
  }
}
