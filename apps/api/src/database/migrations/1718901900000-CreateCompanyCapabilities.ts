import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 6.11 (DL-072, reescreve o DL-057). Capabilities POR EMPRESA.
 *
 * ADITIVA E SEM PERDA DE ACESSO (AC final da 6.11 + DL-064):
 * 1. Cria `company_capabilities` — LISTA de recursos liberados. Recurso novo é
 *    linha, não migration; por isso `capability` é VARCHAR e não ENUM.
 * 2. Adiciona `companies.plan` como RÓTULO comercial (histórico do que foi
 *    vendido), com DEFAULT 'basico' — as linhas já existentes recebem 'basico'
 *    sem conversão de dado. O campo NUNCA decide acesso.
 * 3. NÃO concede capability a ninguém. Isso é deliberado, não esquecimento: o
 *    preset de preservação do acesso atual é VAZIO
 *    (`capability-presets.ts#PRESERVE_CURRENT_ACCESS`) porque, na virada, NENHUM
 *    recurso em produção é gateado por capability — `whatsapp_bot` e
 *    `lembrete_automatico` ainda não existem. Ninguém perde acesso porque nada
 *    existente muda de gate; conceder o Pró a todos aqui DARIA acesso que
 *    ninguém tinha.
 *
 * Índice: a `UNIQUE (company_id, capability)` tem `company_id` como PRIMEIRA
 * coluna, então ela já serve de índice para a leitura do gate
 * (`WHERE company_id = ?`). Um `KEY` avulso de `company_id` seria redundante —
 * custo de escrita sem ganho de leitura.
 *
 * Provado contra base POPULADA em `test/migration-company-capabilities.e2e-spec.ts`.
 */
export class CreateCompanyCapabilities1718901900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `companies` ADD `plan` VARCHAR(20) NOT NULL DEFAULT 'basico'",
    );

    await queryRunner.query(`
      CREATE TABLE \`company_capabilities\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`company_id\` BIGINT NOT NULL,
        \`capability\` VARCHAR(50) NOT NULL,
        \`granted_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`granted_by\` VARCHAR(100) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_company_capability\` (\`company_id\`, \`capability\`),
        CONSTRAINT \`fk_company_capabilities_company\`
          FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE `company_capabilities`");
    await queryRunner.query("ALTER TABLE `companies` DROP COLUMN `plan`");
  }
}
