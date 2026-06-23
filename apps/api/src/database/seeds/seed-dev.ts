import "reflect-metadata";
import { DataSource } from "typeorm";
import * as bcrypt from "bcryptjs";
import { buildDataSourceOptions } from "../data-source-options";
import { Company } from "../entities/company.entity";
import { User } from "../entities/user.entity";

/**
 * Seed de desenvolvimento — idempotente. Cria uma instalação de teste e um
 * usuário owner para tornar o login do painel testável. SÓ PARA DEV.
 * Credenciais: dono@tamarcado.dev / tamarcado123
 */
const COMPANY_SLUG = "salao-teste";
const OWNER_EMAIL = "dono@tamarcado.dev";
const OWNER_PASSWORD = "tamarcado123";

async function run(): Promise<void> {
  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  try {
    const companies = ds.getRepository(Company);
    const users = ds.getRepository(User);

    let company = await companies.findOne({ where: { slug: COMPANY_SLUG } });
    if (!company) {
      company = await companies.save(
        companies.create({ name: "Salão Teste", slug: COMPANY_SLUG }),
      );
      console.log(`Company criada (${company.id}): Salão Teste`);
    } else {
      console.log("Company 'Salão Teste' já existe.");
    }

    const existing = await users.findOne({
      where: { company_id: company.id, email: OWNER_EMAIL },
    });
    if (!existing) {
      const owner = await users.save(
        users.create({
          company_id: company.id,
          name: "Dono Teste",
          email: OWNER_EMAIL,
          password_hash: await bcrypt.hash(OWNER_PASSWORD, 10),
          access_level: "owner",
          attends_clients: true,
          theme: "light",
          is_active: true,
        }),
      );
      console.log(
        `Owner criado: ${owner.email} / senha: ${OWNER_PASSWORD} (DEV)`,
      );
    } else {
      console.log("Owner de dev já existe, nada a fazer.");
    }
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error("Falha no seed:", err);
  process.exit(1);
});
