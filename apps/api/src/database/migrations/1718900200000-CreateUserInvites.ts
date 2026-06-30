import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from "typeorm";

/**
 * Cria a tabela `user_invites` (Story 1.4, DL-029): convites de equipe.
 * - FK `company_id → companies(id)`; índices liderados por `company_id`.
 * - `token_hash` único (lookup do aceite). `users.password_hash` permanece
 *   NOT NULL — o usuário é criado no aceite, não no convite.
 */
export class CreateUserInvites1718900200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "user_invites",
        columns: [
          {
            name: "id",
            type: "bigint",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "company_id", type: "bigint", isNullable: false },
          { name: "email", type: "varchar", length: "200", isNullable: false },
          { name: "name", type: "varchar", length: "100", isNullable: false },
          {
            name: "access_level",
            type: "enum",
            enum: ["owner", "manager", "basic"],
            isNullable: false,
          },
          {
            name: "attends_clients",
            type: "boolean",
            isNullable: false,
            default: false,
          },
          {
            name: "token_hash",
            type: "varchar",
            length: "255",
            isNullable: false,
          },
          { name: "expires_at", type: "timestamp", isNullable: false },
          { name: "accepted_at", type: "timestamp", isNullable: true },
          { name: "invited_by", type: "bigint", isNullable: true },
          {
            name: "created_at",
            type: "timestamp",
            isNullable: false,
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            isNullable: false,
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices("user_invites", [
      new TableIndex({
        name: "uq_user_invites_token",
        columnNames: ["token_hash"],
        isUnique: true,
      }),
      new TableIndex({
        name: "idx_user_invites_company_email",
        columnNames: ["company_id", "email"],
      }),
    ]);

    await queryRunner.createForeignKey(
      "user_invites",
      new TableForeignKey({
        name: "fk_user_invites_company",
        columnNames: ["company_id"],
        referencedTableName: "companies",
        referencedColumnNames: ["id"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("user_invites"); // remove FKs e índices junto
  }
}
