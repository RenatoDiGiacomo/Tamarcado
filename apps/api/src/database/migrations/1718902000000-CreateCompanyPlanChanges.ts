import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 6.16 (DL-076). Registro de auditoria das mudanças de plano/capabilities.
 *
 * ADITIVA E SEM CONVERSÃO DE DADO: cria uma tabela nova e vazia, não toca em
 * nenhuma linha existente. Não há backfill possível nem desejável — o histórico
 * começa agora, e inventar entradas para o passado seria inventar auditoria.
 *
 * `ON DELETE CASCADE` acompanha o resto do schema: apagar a empresa apaga o
 * histórico dela junto. É o comportamento certo aqui — o registro existe para
 * sustentar a relação comercial com um cliente que existe.
 *
 * Provada contra base POPULADA em `test/migration-company-plan-changes.e2e-spec.ts`
 * (DL-064).
 */
export class CreateCompanyPlanChanges1718902000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`company_plan_changes\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`company_id\` BIGINT NOT NULL,
        \`plan_before\` VARCHAR(20) NULL,
        \`plan_after\` VARCHAR(20) NULL,
        \`capabilities_before\` JSON NOT NULL,
        \`capabilities_after\` JSON NOT NULL,
        \`changed_by\` VARCHAR(100) NOT NULL,
        \`reason\` VARCHAR(255) NULL,
        \`ip\` VARCHAR(45) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_company_plan_changes_company\` (\`company_id\`, \`created_at\`),
        CONSTRAINT \`fk_company_plan_changes_company\`
          FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE `company_plan_changes`");
  }
}
