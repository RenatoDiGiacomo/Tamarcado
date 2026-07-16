// Sobe o ambiente de DEV híbrido com UM comando: `pnpm dev`.
//
//   1. Garante o apps/api/.env (copia do .env.example na primeira vez).
//   2. Sobe a infra (MySQL/Redis) em containers, e AGUARDA ficar saudável.
//   3. Aplica as migrations pendentes (idempotente).
//   4. Semeia dados de dev (owner de teste dono@tamarcado.dev; idempotente).
//   5. Liga API (nest --watch) e Web (Vite HMR) NATIVOS no host, com hot-reload.
//
// Ctrl+C encerra a API e o Web. A infra segue no ar (banco persiste); para
// derrubá-la use `pnpm dev:down`.
import { execSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE = "infra/compose/docker-compose.infra.yml";

const run = (cmd, opts = {}) =>
  execSync(cmd, { cwd: repoRoot, stdio: "inherit", ...opts });

function step(msg) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

// 1. .env da API (o boot exige JWT_SECRET; sem .env a API não sobe).
const apiEnv = join(repoRoot, "apps", "api", ".env");
if (!existsSync(apiEnv)) {
  step("Criando apps/api/.env a partir do .env.example (primeira execução)");
  copyFileSync(join(repoRoot, "apps", "api", ".env.example"), apiEnv);
}

// 2. Infra em container, esperando ficar saudável.
step("Subindo infra (MySQL, Redis, Evolution) e aguardando o banco...");
try {
  run(`docker compose -f ${COMPOSE} up -d --wait`);
} catch {
  console.error(
    "\n\x1b[31m✖ Falha ao subir a infra.\x1b[0m Verifique se o Docker Desktop está aberto " +
      "e se as portas 3306/6379/8080 estão livres.",
  );
  process.exit(1);
}

// 3. Migrations (schema em dia — idempotente, aplica só o que falta).
step("Aplicando migrations pendentes...");
try {
  run("pnpm --filter api run migration:run");
} catch {
  console.error(
    "\n\x1b[31m✖ Falha nas migrations.\x1b[0m A API precisa do schema para servir. " +
      "Veja o erro acima.",
  );
  process.exit(1);
}

// 4. Seed de dev (idempotente — cria o owner de teste se faltar, senão no-op).
//    Garante que o ambiente já venha logável com dono@tamarcado.dev.
step("Semeando dados de dev (owner de teste, se ainda não existir)...");
try {
  run("pnpm --filter api run seed:dev");
} catch {
  console.error(
    "\n\x1b[31m✖ Falha no seed.\x1b[0m O ambiente sobe, mas talvez sem o usuário " +
      "de teste. Veja o erro acima.",
  );
  process.exit(1);
}

// 5. API + Web nativos, com watch. Fica em foreground; Ctrl+C encerra os dois.
step("Ligando API (:3000) e Web (:5173) com hot-reload. Ctrl+C para parar.");
run("pnpm exec turbo run dev --filter=api --filter=web");