import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 5.1 (refinamento DL-062, 2026-08-14). Renomeia o papel `manager` →
 * `professional`: o papel deixou de ser administrativo e passou a ser "quem
 * atende, com escopo próprio". Papéis passam a ser **DONO (`owner`)** e
 * **PROFISSIONAL (`professional`)**. `owner` não muda.
 *
 * Feita agora porque a produção tem **zero empresas** — sem dado em uso. Converte
 * os valores existentes antes de estreitar o enum, em `users` e `user_invites`.
 */
export class RenameManagerToProfessional1718901200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) ALARGA o enum para aceitar 'professional' ANTES de converter — senão o
    //    UPDATE tenta gravar um valor que o enum ainda não conhece e o MySQL
    //    rejeita com "Data truncated" (só falha quando HÁ linhas 'manager'; em
    //    banco novo passa despercebido — foi o que escondeu o bug no CI).
    await queryRunner.query(
      "ALTER TABLE `users` MODIFY `access_level` ENUM('owner','manager','professional') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `user_invites` MODIFY `access_level` ENUM('owner','manager','professional') NOT NULL",
    );
    // 2) Converte o dado: manager → professional.
    await queryRunner.query(
      "UPDATE `users` SET `access_level` = 'professional' WHERE `access_level` = 'manager'",
    );
    await queryRunner.query(
      "UPDATE `user_invites` SET `access_level` = 'professional' WHERE `access_level` = 'manager'",
    );
    // 3) ESTREITA o enum: ('owner','professional').
    await queryRunner.query(
      "ALTER TABLE `users` MODIFY `access_level` ENUM('owner','professional') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `user_invites` MODIFY `access_level` ENUM('owner','professional') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversão: alarga o enum p/ aceitar 'manager', converte de volta, estreita.
    await queryRunner.query(
      "ALTER TABLE `user_invites` MODIFY `access_level` ENUM('owner','manager','professional') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `users` MODIFY `access_level` ENUM('owner','manager','professional') NOT NULL",
    );
    await queryRunner.query(
      "UPDATE `users` SET `access_level` = 'manager' WHERE `access_level` = 'professional'",
    );
    await queryRunner.query(
      "UPDATE `user_invites` SET `access_level` = 'manager' WHERE `access_level` = 'professional'",
    );
    await queryRunner.query(
      "ALTER TABLE `users` MODIFY `access_level` ENUM('owner','manager') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `user_invites` MODIFY `access_level` ENUM('owner','manager') NOT NULL",
    );
  }
}
