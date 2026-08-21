import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Story 5.10 — SAÍDAS: pagamento à equipe registrado no Financeiro (fecha o
 * previsão→real). Tabela `team_payments`: valor pago a um profissional, com a
 * data do pagamento e o período a que se refere. FK ao usuário (CASCADE) e à
 * empresa; índice liderado por `company_id`.
 */
export class CreateTeamPayments1718901600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`team_payments\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`company_id\` BIGINT NOT NULL,
        \`professional_id\` BIGINT NOT NULL,
        \`amount\` DECIMAL(10,2) NOT NULL,
        \`paid_on\` DATE NOT NULL,
        \`period_from\` DATE NOT NULL,
        \`period_to\` DATE NOT NULL,
        \`note\` VARCHAR(200) NULL,
        \`created_by_user_id\` BIGINT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_team_payments_company_paid\` (\`company_id\`, \`paid_on\`),
        CONSTRAINT \`fk_team_payments_company\` FOREIGN KEY (\`company_id\`)
          REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_team_payments_professional\` FOREIGN KEY (\`professional_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_team_payments_creator\` FOREIGN KEY (\`created_by_user_id\`)
          REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE `team_payments`");
  }
}
