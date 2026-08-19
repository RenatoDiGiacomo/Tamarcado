import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

/**
 * Story 5.2 — Financeiro: registro de pagamento por agendamento. UM pagamento
 * por agendamento (unique `appointment_id`): valor, forma **opcional** e situação
 * (`pago`/`pendente`). A situação do pagamento é **própria** — NÃO é o status do
 * agendamento (registrar como `pendente` não força o agendamento a concluído).
 * Acesso é do módulo Financeiro (DL-062) — enforçado nos endpoints/leitura.
 */
export class CreatePayments1718901300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "payments",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "company_id", type: "bigint" },
          { name: "appointment_id", type: "bigint" },
          { name: "amount", type: "decimal", precision: 10, scale: 2 },
          {
            name: "method",
            type: "enum",
            enum: ["dinheiro", "pix", "debito", "credito", "outro"],
            isNullable: true,
          },
          { name: "status", type: "enum", enum: ["pago", "pendente"] },
          { name: "created_by_user_id", type: "bigint", isNullable: true },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
        ],
      }),
    );

    // Um pagamento por agendamento (upsert). Único por (company_id, appointment_id).
    await queryRunner.createIndex(
      "payments",
      new TableIndex({
        name: "uq_payments_appointment",
        columnNames: ["company_id", "appointment_id"],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      "payments",
      new TableForeignKey({
        name: "fk_payments_appointment",
        columnNames: ["appointment_id"],
        referencedTableName: "appointments",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );
    await queryRunner.createForeignKey(
      "payments",
      new TableForeignKey({
        name: "fk_payments_company",
        columnNames: ["company_id"],
        referencedTableName: "companies",
        referencedColumnNames: ["id"],
      }),
    );
    await queryRunner.createForeignKey(
      "payments",
      new TableForeignKey({
        name: "fk_payments_user",
        columnNames: ["created_by_user_id"],
        referencedTableName: "users",
        referencedColumnNames: ["id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("payments");
  }
}
