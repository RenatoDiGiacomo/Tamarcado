import { DataSourceOptions } from "typeorm";
import { Company } from "./entities/company.entity";
import { CreateCompanies1718900000000 } from "./migrations/1718900000000-CreateCompanies";

/**
 * Opções de conexão TypeORM compartilhadas entre o runtime (DatabaseModule)
 * e a CLI de migrations (typeorm.config.ts).
 *
 * Lê DATABASE_URL quando presente (ex.: docker-compose), senão monta a partir
 * de variáveis discretas com defaults de desenvolvimento local.
 *
 * `synchronize` é sempre false — o schema evolui exclusivamente por migrations.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;

  const base = {
    type: "mysql" as const,
    entities: [Company],
    migrations: [CreateCompanies1718900000000],
    synchronize: false,
    migrationsRun: false,
    timezone: "Z", // banco em UTC; conversão de fuso na aplicação (ADR-008)
    retryAttempts: 1,
  };

  if (url) {
    return { ...base, url };
  }

  return {
    ...base,
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    username: process.env.DATABASE_USER ?? "root",
    password: process.env.DATABASE_PASSWORD ?? "root",
    database: process.env.DATABASE_NAME ?? "tamarcado_dev",
  };
}
