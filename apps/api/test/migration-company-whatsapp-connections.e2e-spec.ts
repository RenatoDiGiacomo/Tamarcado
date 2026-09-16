import { DataSource } from "typeorm";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Story 6.1 — migration das credenciais por tenant, contra base POPULADA (DL-064).
 *
 * A migration é ADITIVA PURA: cria uma tabela nova e vazia e **não toca**
 * `companies` (DL-084). O DL-064 exige o teste contra base populada para
 * migrations que CONVERTEM dado; aqui ele cobre outra coisa, que já mordeu o
 * projeto: `CREATE TABLE` com FK falha em base real quando o tipo da coluna não
 * bate com o da referenciada (`companies.id` é BIGINT), e em base vazia isso
 * passa igual.
 *
 * O que fica provado:
 *  - aplica sobre uma base com empresas, capabilities e conexões já dentro;
 *  - nada do que existia muda;
 *  - as DUAS unicidades estão de pé — uma conexão por empresa, e um número por
 *    plataforma inteira (é ela que faz o roteamento do webhook ser determinístico);
 *  - `provider` NÃO tem default (AC-2): omiti-lo é erro, não `evolution_api`;
 *  - o `ON DELETE CASCADE` da FK funciona;
 *  - o `down` é reversível.
 */
jest.setTimeout(60000);

describe("Migration CreateCompanyWhatsappConnections — base POPULADA (e2e)", () => {
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

  beforeEach(async () => {
    await resetSchema(ds);
  });

  async function criarEmpresa(slug: string): Promise<string> {
    const { insertId } = (await ds.query(
      "INSERT INTO companies (name, slug) VALUES (?, ?)",
      [slug, slug],
    )) as { insertId: number };
    return String(insertId);
  }

  async function conectar(
    companyId: string,
    phoneNumberId: string,
  ): Promise<void> {
    await ds.query(
      "INSERT INTO company_whatsapp_connections (company_id, provider, phone_number_id, access_token) VALUES (?, ?, ?, ?)",
      [companyId, "cloud_api", phoneNumberId, "v1:iv:tag:cifra"],
    );
  }

  it("aplica sobre base populada sem alterar o que já existia", async () => {
    const companyId = await criarEmpresa("salao-antigo");
    await ds.query(
      "INSERT INTO company_capabilities (company_id, capability, granted_by) VALUES (?, ?, ?)",
      [companyId, "whatsapp_bot", "preset:pro"],
    );
    const antes = (await ds.query("SELECT * FROM companies")) as unknown[];

    // Desfaz até esta migration sair e reaplica sobre a base já populada.
    for (let i = 0; i < 5; i += 1) {
      const aplicada = (await ds.query(
        "SELECT 1 FROM migrations WHERE name LIKE '%CreateCompanyWhatsappConnections%'",
      )) as unknown[];
      if (aplicada.length === 0) break;
      await ds.undoLastMigration();
    }
    await ds.runMigrations();

    expect(await ds.query("SELECT * FROM companies")).toEqual(antes);
    expect(
      await ds.query("SELECT * FROM company_whatsapp_connections"),
    ).toEqual([]);
  });

  it("uma conexão por empresa", async () => {
    const companyId = await criarEmpresa("salao-a");
    await conectar(companyId, "PN-1");
    await expect(conectar(companyId, "PN-2")).rejects.toThrow(/Duplicate/i);
  });

  it("um número por PLATAFORMA — é o que torna o roteamento determinístico", async () => {
    const a = await criarEmpresa("salao-a");
    const b = await criarEmpresa("salao-b");
    await conectar(a, "PN-COMPARTILHADO");
    // Sem esta unicidade, duas empresas reivindicariam o mesmo evento da Meta e
    // o roteamento viraria sorteio.
    await expect(conectar(b, "PN-COMPARTILHADO")).rejects.toThrow(/Duplicate/i);
  });

  it("`provider` NÃO tem default (AC-2)", async () => {
    // Default `evolution_api` acabaria valendo em produção por omissão — e
    // produção é exclusivamente Cloud API oficial (DL-054).
    const companyId = await criarEmpresa("salao-a");
    await expect(
      ds.query(
        "INSERT INTO company_whatsapp_connections (company_id, phone_number_id, access_token) VALUES (?, ?, ?)",
        [companyId, "PN-1", "v1:iv:tag:cifra"],
      ),
    ).rejects.toThrow();
  });

  it("apagar a empresa leva a conexão junto", async () => {
    const companyId = await criarEmpresa("salao-a");
    await conectar(companyId, "PN-1");
    await ds.query("DELETE FROM companies WHERE id = ?", [companyId]);
    expect(
      await ds.query("SELECT * FROM company_whatsapp_connections"),
    ).toEqual([]);
  });

  it("o down é reversível", async () => {
    await ds.undoLastMigration();
    const tabelas = (await ds.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_whatsapp_connections'",
    )) as unknown[];
    expect(tabelas).toEqual([]);
    await ds.runMigrations();
  });
});
