import { DataSource } from "typeorm";
import { Company } from "../src/database/entities/company.entity";
import { createTestDataSource, resetSchema, dropSchema } from "./test-db";

/**
 * Guarda o bug de deploy que passou no CI (base vazia) e quebrou no dev (base
 * populada): a `RenameManagerToProfessional` convertia `manager→professional`
 * ANTES de o enum aceitar o novo valor → "Data truncated" **só quando havia
 * linhas**. Aqui rodamos a conversão contra uma base **POPULADA**: desfaz o
 * rename, insere um usuário `manager`, e re-aplica — provando que converte sem
 * truncar. É o padrão para QUALQUER migration que converte dado (DL — ver
 * decision-log 2026-08-18). Requer MySQL.
 */
jest.setTimeout(60000);

describe("Migration RenameManagerToProfessional — contra base POPULADA (e2e)", () => {
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

  it("converte manager→professional numa base com linhas (não trunca)", async () => {
    // Volta para ANTES do rename: desfaz os migrations do topo UM A UM até o
    // rename sair (robusto a novos migrations empilhados depois dele). O enum de
    // `access_level` volta a ('owner','manager').
    for (let i = 0; i < 30; i++) {
      const applied: unknown[] = await ds.query(
        "SELECT 1 FROM migrations WHERE name LIKE '%RenameManagerToProfessional%'",
      );
      if (applied.length === 0) break;
      await ds.undoLastMigration();
    }

    // POPULADA: uma empresa + um usuário com o valor ANTIGO ('manager').
    const company = await ds
      .getRepository(Company)
      .save(ds.getRepository(Company).create({ name: "Conv", slug: "conv-mig" }));
    await ds.query(
      `INSERT INTO users (company_id, name, email, password_hash, access_level)
       VALUES (?, 'Prof', 'prof@conv.dev', 'x', 'manager')`,
      [company.id],
    );

    // Re-aplica as migrations (inclui o rename). Com o bug de ordem, isto lançava
    // 'Data truncated' por causa da linha 'manager'. Com o fix, converte.
    await ds.runMigrations();

    const rows: Array<{ access_level: string }> = await ds.query(
      "SELECT access_level FROM users WHERE email = 'prof@conv.dev'",
    );
    expect(rows[0]?.access_level).toBe("professional");
  });
});
