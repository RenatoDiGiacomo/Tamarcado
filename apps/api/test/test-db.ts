import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "../src/database/data-source-options";

/** Tabelas conhecidas, em ordem reversa de dependência (para drop). */
const KNOWN_TABLES = [
  "company_capabilities",
  "team_payments",
  "payments",
  "appointment_changes",
  "appointments",
  "clients",
  "professional_services",
  "professional_schedules",
  "salon_services",
  "user_invites",
  "users",
  "companies",
];

export async function createTestDataSource(): Promise<DataSource> {
  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  return ds;
}

/**
 * Zera o schema de forma FK-safe e reaplica todas as migrations. Cada arquivo
 * e2e chama isto no beforeAll para ficar independente da ordem de execução.
 */
export async function resetSchema(ds: DataSource): Promise<void> {
  await ds.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of KNOWN_TABLES) {
    await ds.query(`DROP TABLE IF EXISTS ${table}`);
  }
  await ds.query("DROP TABLE IF EXISTS migrations");
  await ds.query("SET FOREIGN_KEY_CHECKS = 1");
  await ds.runMigrations();
}

export async function dropSchema(ds: DataSource): Promise<void> {
  await ds.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of KNOWN_TABLES) {
    await ds.query(`DROP TABLE IF EXISTS ${table}`);
  }
  await ds.query("DROP TABLE IF EXISTS migrations");
  await ds.query("SET FOREIGN_KEY_CHECKS = 1");
}
