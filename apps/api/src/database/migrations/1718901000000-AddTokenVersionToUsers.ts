import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 1.2.04 (DL-025-nota realizada): versão de sessão por usuário para
 * revogar tokens ao trocar/redefinir senha. Coluna ADITIVA — usuários
 * existentes recebem `0`, o mesmo valor que tokens já emitidos assumem quando
 * não trazem o claim (`tokenVersion` ausente = 0). Assim nada em uso quebra: o
 * corte só acontece na PRIMEIRA troca de senha, que leva a versão a 1.
 */
export class AddTokenVersionToUsers1718901000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `users` ADD `token_version` INT NOT NULL DEFAULT 0",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `users` DROP COLUMN `token_version`");
  }
}