import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Redesenho da página pública — 1ª leva (spec de UX de 2026-08-26).
 *
 * Campos de EXIBIÇÃO da página `/agendar/{slug}`: descrição do serviço, e o
 * endereço, o link do mapa e as redes do estabelecimento. Nenhuma regra de
 * negócio depende deles — página e formulários apenas mostram e editam.
 *
 * ADITIVO e tudo NULL: instalação existente não precisa preencher nada, e a
 * página se vira sem — quem não tem endereço não ganha a linha, quem não tem
 * Instagram não ganha o botão.
 *
 * **Fora desta leva (2ª):** `salon_services.image_url` e `users.avatar_url`, que
 * dependem de upload de arquivo.
 */
export class AddPublicPageFields1718901700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 280 caracteres: a descrição é apoio à decisão ("inclui lavagem"), cortada
    // em duas linhas no card. Não é campo de texto corrido.
    await queryRunner.query(
      "ALTER TABLE `salon_services` ADD `description` VARCHAR(280) NULL",
    );
    // Endereço em UM campo (decisão da spec): mais rápido de preencher no
    // celular, e o link do mapa resolve o "como chegar" sem geocoding.
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `address` VARCHAR(200) NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `maps_url` VARCHAR(500) NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `instagram_url` VARCHAR(200) NULL",
    );
    // Guardado como o dono digita; o link do WhatsApp é montado na exibição.
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `whatsapp_phone` VARCHAR(20) NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `companies` DROP COLUMN `whatsapp_phone`",
    );
    await queryRunner.query(
      "ALTER TABLE `companies` DROP COLUMN `instagram_url`",
    );
    await queryRunner.query("ALTER TABLE `companies` DROP COLUMN `maps_url`");
    await queryRunner.query("ALTER TABLE `companies` DROP COLUMN `address`");
    await queryRunner.query(
      "ALTER TABLE `salon_services` DROP COLUMN `description`",
    );
  }
}
