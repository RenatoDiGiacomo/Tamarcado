import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Story 6.16 — migration do registro de auditoria, contra base POPULADA (DL-064).
 *
 * Esta migration é ADITIVA PURA: cria uma tabela nova e vazia, sem converter
 * nem tocar dado nenhum. O DL-064 exige o teste contra base populada para
 * migrations que CONVERTEM dado — aqui ele cobre outra coisa, que também já
 * mordeu o projeto: `CREATE TABLE` com FK falha em base real quando o tipo da
 * coluna não bate com o da referenciada (`companies.id` é BIGINT), e em base
 * vazia isso passa igual.
 *
 * O que fica provado:
 *  - a migration aplica sobre uma base com empresas e capabilities já dentro;
 *  - nada do que existia muda;
 *  - o `ON DELETE CASCADE` da FK está de pé;
 *  - o `down` é reversível.
 */
jest.setTimeout(60000);

describe("Migration CreateCompanyPlanChanges — contra base POPULADA (e2e)", () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await createTestDataSource();
    await resetSchema(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      await dropSchema(ds);
      await ds.destroy();
    }
  });

  /** Desfaz as migrations do topo até a desta story sair. */
  async function voltarParaAntesDaMigration(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      const aplicada: unknown[] = await ds.query(
        "SELECT 1 FROM migrations WHERE name LIKE '%CreateCompanyPlanChanges%'",
      );
      if (aplicada.length === 0) break;
      await ds.undoLastMigration();
    }
  }

  beforeEach(async () => {
    await resetSchema(ds);
  });

  it("aplica sobre base populada sem alterar o que já existia", async () => {
    await voltarParaAntesDaMigration();

    // Base "de antes": empresa com capability já concedida.
    const { insertId } = (await ds.query(
      "INSERT INTO companies (name, slug, plan) VALUES (?, ?, ?)",
      ["Salão Antigo", "salao-antigo", "pro"],
    )) as { insertId: number };
    const companyId = String(insertId);
    await ds.query(
      "INSERT INTO company_capabilities (company_id, capability, granted_by) VALUES (?, ?, ?)",
      [companyId, "whatsapp_bot", "preset:pro"],
    );

    await ds.runMigrations();

    const empresas: { slug: string; plan: string }[] = await ds.query(
      "SELECT slug, plan FROM companies",
    );
    expect(empresas).toEqual([{ slug: "salao-antigo", plan: "pro" }]);

    const capabilities: unknown[] = await ds.query(
      "SELECT capability FROM company_capabilities",
    );
    expect(capabilities).toEqual([{ capability: "whatsapp_bot" }]);

    // A tabela nova nasce VAZIA: o histórico começa agora, e inventar entradas
    // para o passado seria inventar auditoria.
    const registros: unknown[] = await ds.query(
      "SELECT * FROM company_plan_changes",
    );
    expect(registros).toEqual([]);
  });

  it("a FK segura o company_id e cascateia no apagamento da empresa", async () => {
    const { insertId } = (await ds.query(
      "INSERT INTO companies (name, slug, plan) VALUES (?, ?, ?)",
      ["Salão Novo", "salao-novo", "basico"],
    )) as { insertId: number };
    const companyId = String(insertId);

    await ds.query(
      `INSERT INTO company_plan_changes
         (company_id, plan_before, plan_after, capabilities_before, capabilities_after, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, "basico", "pro", "[]", '["whatsapp_bot"]', "renato"],
    );

    // Empresa inexistente não entra: auditoria órfã não serve para nada.
    await expect(
      ds.query(
        `INSERT INTO company_plan_changes
           (company_id, capabilities_before, capabilities_after, changed_by)
         VALUES (?, ?, ?, ?)`,
        [999999, "[]", "[]", "renato"],
      ),
    ).rejects.toThrow();

    await ds.query("DELETE FROM companies WHERE id = ?", [companyId]);
    const restantes: unknown[] = await ds.query(
      "SELECT * FROM company_plan_changes",
    );
    expect(restantes).toEqual([]);
  });

  it("o down é reversível (sobe, desce e sobe de novo)", async () => {
    await voltarParaAntesDaMigration();
    const semTabela: unknown[] = await ds.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_plan_changes'",
    );
    expect(semTabela).toEqual([]);

    await ds.runMigrations();
    const comTabela: unknown[] = await ds.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_plan_changes'",
    );
    expect(comTabela).toHaveLength(1);
  });
});
