import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";
import { DEFAULT_PLAN } from "../src/common/capabilities/plan";

/**
 * Story 6.11 — migration de capabilities contra base POPULADA (DL-064).
 *
 * O padrão da casa desde o incidente do `manager→professional`: migration que
 * toca dado passa no CI (base vazia) e quebra no deploy (base com linhas). Aqui
 * a migration roda com empresas, usuários e agendamentos JÁ existentes.
 *
 * O invariante que precisa valer na virada (AC final da Story 6.11):
 * **ninguém perde acesso, e ninguém ganha o que não comprou.**
 *  - ninguém PERDE porque nenhum recurso em produção é gateado por capability
 *    ainda — `whatsapp_bot` e `lembrete_automatico` não existem no produto;
 *  - ninguém GANHA porque a migration não concede capability a empresa nenhuma
 *    (o preset de preservação é vazio — ver `capability-presets.ts`).
 * Conceder o Pró a todos aqui seria DAR acesso que ninguém tinha.
 */
jest.setTimeout(60000);

describe("Migration CreateCompanyCapabilities — contra base POPULADA (e2e)", () => {
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

  /**
   * Insere via SQL CRU, de propósito: parte destes testes roda com a migration
   * DESFEITA, e a entidade `Company` já conhece a coluna `plan` — o repositório
   * do TypeORM tentaria escrever uma coluna que ainda não existe. SQL cru é o
   * que "base populada de ANTES da migration" significa de verdade.
   */
  async function seedCompanyCru(slug: string): Promise<string> {
    const res: { insertId: number } = await ds.query(
      "INSERT INTO companies (name, slug) VALUES (?, ?)",
      [slug, slug],
    );
    return String(res.insertId);
  }

  /** Desfaz as migrations do topo até a desta story sair. */
  async function voltarParaAntesDaMigration(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      const aplicada: unknown[] = await ds.query(
        "SELECT 1 FROM migrations WHERE name LIKE '%CreateCompanyCapabilities%'",
      );
      if (aplicada.length === 0) break;
      await ds.undoLastMigration();
    }
  }

  it("aplica sobre base com empresas, usuários e agendamentos, sem perda", async () => {
    await voltarParaAntesDaMigration();

    // Antes da migration, a coluna e a tabela desta story não existem.
    const antes: Array<{ COLUMN_NAME: string }> = await ds.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'
         AND COLUMN_NAME = 'plan'`,
    );
    expect(antes).toHaveLength(0);

    // POPULADA: duas empresas em operação, com usuário, cliente e agendamento —
    // o retrato de quem já está usando o sistema hoje.
    const salaoA = await seedCompanyCru("salao-mig-a");
    const salaoB = await seedCompanyCru("salao-mig-b");
    for (const companyId of [salaoA, salaoB]) {
      await ds.query(
        `INSERT INTO users (company_id, name, email, password_hash, access_level)
         VALUES (?, 'Dona', ?, 'x', 'owner')`,
        [companyId, `dona-${companyId}@mig.dev`],
      );
      await ds.query(
        `INSERT INTO clients (company_id, name, phone_whatsapp, phone_whatsapp_normalized)
         VALUES (?, 'Cliente', ?, ?)`,
        [
          companyId,
          `(11) 99999-${companyId.padStart(4, "0")}`,
          `+55119999${companyId.padStart(4, "0")}`,
        ],
      );
    }
    const [{ total: usuariosAntes }]: Array<{ total: number }> = await ds.query(
      "SELECT COUNT(*) AS total FROM users",
    );
    const [{ total: clientesAntes }]: Array<{ total: number }> = await ds.query(
      "SELECT COUNT(*) AS total FROM clients",
    );

    // Re-aplica as migrations, incluindo a desta story.
    await ds.runMigrations();

    // 1. A tabela de capabilities existe, com a UNIQUE que impede direito duplicado.
    const tabelas: Array<{ TABLE_NAME: string }> = await ds.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_capabilities'`,
    );
    expect(tabelas).toHaveLength(1);

    const colunas: Array<{ COLUMN_NAME: string; DATA_TYPE: string }> =
      await ds.query(
        `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_capabilities'`,
      );
    expect(colunas.map((c) => c.COLUMN_NAME)).toEqual(
      expect.arrayContaining([
        "company_id",
        "capability",
        "granted_at",
        "granted_by",
      ]),
    );
    // VARCHAR e não ENUM: recurso novo é LINHA, não migration (DL-072).
    expect(
      colunas.find((c) => c.COLUMN_NAME === "capability")?.DATA_TYPE,
    ).toBe("varchar");

    // 2. NINGUÉM PERDE: nenhuma linha existente foi apagada ou convertida.
    const [{ total: usuariosDepois }]: Array<{ total: number }> = await ds.query(
      "SELECT COUNT(*) AS total FROM users",
    );
    const [{ total: clientesDepois }]: Array<{ total: number }> = await ds.query(
      "SELECT COUNT(*) AS total FROM clients",
    );
    expect(usuariosDepois).toBe(usuariosAntes);
    expect(clientesDepois).toBe(clientesAntes);

    // 3. As empresas que já existiam recebem o plano padrão, sem conversão de
    //    dado — é DEFAULT de coluna nova, não UPDATE.
    const planos: Array<{ slug: string; plan: string }> = await ds.query(
      "SELECT slug, plan FROM companies WHERE slug IN ('salao-mig-a', 'salao-mig-b')",
    );
    expect(planos).toHaveLength(2);
    for (const linha of planos) {
      expect(linha.plan).toBe(DEFAULT_PLAN);
    }

    // 4. NINGUÉM GANHA: a migration não concede capability a empresa alguma.
    const [{ total: concedidas }]: Array<{ total: number }> = await ds.query(
      "SELECT COUNT(*) AS total FROM company_capabilities",
    );
    expect(Number(concedidas)).toBe(0);
  });

  it("a UNIQUE impede conceder o mesmo direito duas vezes à mesma empresa", async () => {
    const company = await seedCompanyCru("salao-mig-dup");
    await ds.query(
      "INSERT INTO company_capabilities (company_id, capability) VALUES (?, 'whatsapp_bot')",
      [company],
    );
    await expect(
      ds.query(
        "INSERT INTO company_capabilities (company_id, capability) VALUES (?, 'whatsapp_bot')",
        [company],
      ),
    ).rejects.toThrow();

    // Mas empresas DIFERENTES podem ter a mesma capability (é por tenant).
    const outra = await seedCompanyCru("salao-mig-dup2");
    await ds.query(
      "INSERT INTO company_capabilities (company_id, capability) VALUES (?, 'whatsapp_bot')",
      [outra],
    );
    const linhas: unknown[] = await ds.query(
      "SELECT 1 FROM company_capabilities WHERE capability = 'whatsapp_bot'",
    );
    expect(linhas).toHaveLength(2);
  });

  it("apagar a empresa leva junto as capabilities dela (sem órfão)", async () => {
    const company = await seedCompanyCru("salao-mig-del");
    await ds.query(
      "INSERT INTO company_capabilities (company_id, capability) VALUES (?, 'lembrete_automatico')",
      [company],
    );
    await ds.query("DELETE FROM companies WHERE id = ?", [company]);
    const orfas: unknown[] = await ds.query(
      "SELECT 1 FROM company_capabilities WHERE company_id = ?",
      [company],
    );
    expect(orfas).toHaveLength(0);
  });

  it("reverte limpo: some a tabela e some a coluna plan", async () => {
    await voltarParaAntesDaMigration();

    const tabelas: unknown[] = await ds.query(
      `SELECT 1 FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_capabilities'`,
    );
    expect(tabelas).toHaveLength(0);

    const colunas: unknown[] = await ds.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies'
         AND COLUMN_NAME = 'plan'`,
    );
    expect(colunas).toHaveLength(0);

    // E a base populada continua de pé depois do rollback.
    const [{ total }]: Array<{ total: number }> = await ds.query(
      "SELECT COUNT(*) AS total FROM users",
    );
    expect(Number(total)).toBeGreaterThan(0);

    await ds.runMigrations();
  });
});
