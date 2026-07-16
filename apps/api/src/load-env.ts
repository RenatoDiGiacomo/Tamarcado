import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Carrega apps/api/.env para o process.env como SIDE-EFFECT do import.
 *
 * Precisa rodar antes de qualquer módulo do Nest ser avaliado: o DatabaseModule
 * chama buildDataSourceOptions() no import-time (TypeOrmModule.forRoot(...)),
 * o que acontece ANTES do ConfigModule.forRoot() carregar o .env. Sem isto, as
 * DATABASE_* do .env seriam ignoradas e cairiam nos defaults do código.
 *
 * Por isso importe este arquivo como a PRIMEIRA linha do main.ts.
 * Também é reutilizado pela CLI do TypeORM (typeorm.config.ts), que roda fora
 * do Nest. Não sobrescreve variáveis já presentes no ambiente (o modo container
 * injeta tudo via compose e não tem .env). Sem dependências externas.
 */
function loadEnv(): void {
  try {
    // __dirname é apps/api/src (ts-node) ou apps/api/dist (build); em ambos
    // ../.env resolve para apps/api/.env.
    const file = readFileSync(resolve(__dirname, "../.env"), "utf8");
    for (const line of file.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key in process.env) continue; // ambiente tem precedência
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  } catch {
    // Sem .env (container/CI): segue com o process.env existente.
  }
}

loadEnv();