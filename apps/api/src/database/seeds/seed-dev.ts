import "reflect-metadata";
// Carrega apps/api/.env (mesma porta/credenciais da API) antes de montar a
// conexão — sem isto o seed cairia nos defaults do código (ex.: porta 3306) e
// divergiria do fluxo dev. Ver load-env.ts.
import "../../load-env";
import { DataSource } from "typeorm";
import * as bcrypt from "bcryptjs";
import { buildDataSourceOptions } from "../data-source-options";
import { Company } from "../entities/company.entity";
import { User } from "../entities/user.entity";

/**
 * Seed de desenvolvimento — idempotente. Cria uma instalação de teste e um
 * usuário owner para tornar o login do painel testável. SÓ PARA DEV.
 */
export const SEED_COMPANY_SLUG = "salao-teste";
export const SEED_OWNER_EMAIL = "dono@tamarcado.dev";
export const SEED_OWNER_PASSWORD = "tamarcado123";

/** Aplica o seed sobre um DataSource já inicializado. Reutilizável em testes. */
export async function seedDev(dataSource: DataSource): Promise<void> {
  const companies = dataSource.getRepository(Company);
  const users = dataSource.getRepository(User);

  let company = await companies.findOne({ where: { slug: SEED_COMPANY_SLUG } });
  if (!company) {
    company = await companies.save(
      companies.create({ name: "Salão Teste", slug: SEED_COMPANY_SLUG }),
    );
    console.log(`Company criada (${company.id}): Salão Teste`);
  } else {
    console.log("Company 'Salão Teste' já existe.");
  }

  const existing = await users.findOne({
    where: { company_id: company.id, email: SEED_OWNER_EMAIL },
  });
  if (!existing) {
    const owner = await users.save(
      users.create({
        company_id: company.id,
        name: "Dono Teste",
        email: SEED_OWNER_EMAIL,
        password_hash: await bcrypt.hash(SEED_OWNER_PASSWORD, 10),
        access_level: "owner",
        attends_clients: true,
        theme: "light",
        is_active: true,
      }),
    );
    console.log(
      `Owner criado: ${owner.email} / senha: ${SEED_OWNER_PASSWORD} (DEV)`,
    );
  } else {
    console.log("Owner de dev já existe, nada a fazer.");
  }
}

/** Entry point CLI (`pnpm --filter api run seed:dev`). */
async function run(): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  try {
    await seedDev(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

// Executa só quando rodado diretamente (não quando importado por um teste).
if (require.main === module) {
  run().catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
}
