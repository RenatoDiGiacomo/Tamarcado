import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 5B.2 (DL-049): agendamento pela página pública ganha `source = 'link'`.
 * Aditivo ao enum existente (`whatsapp | manual | app`) — `app` fica reservado
 * para o app da cliente (futuro). Sem impacto nas linhas existentes.
 */
export class AddLinkToAppointmentSource1718900900000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `appointments` MODIFY `source` ENUM('whatsapp','manual','app','link') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `appointments` MODIFY `source` ENUM('whatsapp','manual','app') NOT NULL",
    );
  }
}
