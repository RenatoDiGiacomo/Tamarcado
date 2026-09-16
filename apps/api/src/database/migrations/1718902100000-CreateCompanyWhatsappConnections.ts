import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 6.1 (DL-073, DL-084). Credenciais de WhatsApp **por tenant**.
 *
 * ADITIVA E SEM CONVERSÃO DE DADO: cria uma tabela nova e vazia. Nenhuma linha
 * existente é lida ou reescrita, e `companies` **não é tocada** — a decisão de
 * não pendurar o token na entidade mais lida do sistema está no DL-084.
 *
 * DUAS UNICIDADES, cada uma resolvendo um problema diferente:
 * - `uq_company_whatsapp_company`: uma conexão por empresa;
 * - `uq_company_whatsapp_phone_number_id`: **global**, porque é por este campo
 *   que o webhook descobre de quem é a mensagem. Sem ela, duas empresas
 *   poderiam reivindicar o mesmo número e o roteamento viraria sorteio.
 *
 * SEM DEFAULT em `provider` (AC-2 da story): default `evolution_api` acabaria
 * valendo em produção por omissão, e produção é exclusivamente Cloud API
 * (DL-054).
 *
 * `ON DELETE CASCADE` acompanha o resto do schema: apagar a empresa leva a
 * conexão junto.
 *
 * Provada contra base POPULADA em
 * `test/migration-company-whatsapp-connections.e2e-spec.ts` (DL-064).
 */
export class CreateCompanyWhatsappConnections1718902100000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`company_whatsapp_connections\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`company_id\` BIGINT NOT NULL,
        \`provider\` VARCHAR(30) NOT NULL,
        \`phone_number_id\` VARCHAR(50) NOT NULL,
        \`waba_id\` VARCHAR(50) NULL,
        \`display_phone_number\` VARCHAR(30) NULL,
        \`access_token\` TEXT NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'conectado',
        \`connected_at\` TIMESTAMP NULL,
        \`connected_by\` VARCHAR(100) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_company_whatsapp_company\` (\`company_id\`),
        UNIQUE KEY \`uq_company_whatsapp_phone_number_id\` (\`phone_number_id\`),
        CONSTRAINT \`fk_company_whatsapp_connections_company\`
          FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE `company_whatsapp_connections`");
  }
}
