# Story 1.1: Walking skeleton e pipeline de entrega

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor (Renato),
I want um monorepo inicializado com API e painel que sobem, banco provisionado e pipeline de CI/CD funcionando,
so that exista um esqueleto implantável de ponta a ponta sobre o qual todas as features são construídas.

## Acceptance Criteria

1. **(AC1 — Bootstrap dev)** Dado o repositório recém-clonado, quando rodo `pnpm install` e subo o Docker Compose de desenvolvimento, então a API NestJS (`apps/api`) sobe e responde `200` em `GET /health`; o painel web (`apps/web`, React+Vite) sobe e renderiza uma página inicial; e MySQL 8 e Redis sobem como serviços do Compose.
2. **(AC2 — Estrutura de workspaces)** Dada a estrutura do monorepo, quando inspeciono os workspaces, então existem `apps/api`, `apps/web`, `apps/mobile` (placeholder), `packages/shared-types`, `packages/shared-utils` conforme a arquitetura (seção 2), sem starter template de terceiros.
3. **(AC3 — Migration inicial)** Dada a migration inicial, quando ela é aplicada, então a tabela `companies` é criada com ao menos `id`, `name`, `timezone` (default `America/Sao_Paulo`), `created_at` — sem criar tabelas que ainda não são necessárias.
4. **(AC4 — CI)** Dado um push para qualquer branch, quando o GitHub Actions roda `ci.yml`, então executa lint, typecheck, testes e build de todos os pacotes, falhando o pipeline em qualquer erro.
5. **(AC5 — Deploy)** Dado um push para `main` com CI verde, quando `deploy.yml` executa, então faz deploy via SSH para o VPS de produção (PM2 restart da API + cópia do build web para o Nginx), conforme ADR-009.
6. **(AC6 — Ambientes)** Dados os ambientes definidos, quando valido a configuração, então dev (Docker Compose local) e staging (local, `docker-compose.staging.yml`, ver ADR-010) estão configurados, e o custo de infraestrutura de produção respeita NFR-O1 (≤ R$130/mês).

## Tasks / Subtasks

> Execute na ordem. Cada task segue red→green→refactor. Não marque `[x]` sem teste passando.

- [ ] **Task 1 — Scaffold do monorepo pnpm + Turborepo (AC2)**
  - [ ] Criar `package.json` raiz com `"private": true`, `"packageManager": "pnpm@9"`, e scripts delegando ao Turbo (`lint`, `typecheck`, `test`, `build`).
  - [ ] Criar `pnpm-workspace.yaml` com `packages: ["apps/*", "packages/*"]`.
  - [ ] Criar `turbo.json` com pipelines `lint`, `typecheck`, `test`, `build` (build com `dependsOn: ["^build"]`).
  - [ ] Criar `.gitignore` (node_modules, dist, .env*, coverage, *.local), `.nvmrc` (`20`), `tsconfig.base.json` raiz com paths para `@tamarcado/shared-types` e `@tamarcado/shared-utils`.
  - [ ] Verde: `pnpm install` completa sem erro e `pnpm -r exec true` enxerga os 5 workspaces.

- [ ] **Task 2 — `packages/shared-types` e `packages/shared-utils` (AC2)**
  - [ ] `packages/shared-types`: pacote TS (`@tamarcado/shared-types`) com `tsconfig.json`, build via `tsc`, um type semente (ex.: `export type CompanyId = number;`) e scripts `lint/typecheck/test/build`.
  - [ ] `packages/shared-utils`: pacote TS (`@tamarcado/shared-utils`) sem dependência de framework. RED: escrever teste (Vitest) de um util puro semente (ex.: `normalizePhoneE164` stub ou `isBlank`). GREEN: implementar. Scripts `lint/typecheck/test/build`.
  - [ ] Verde: `pnpm --filter @tamarcado/shared-utils test` passa.

- [ ] **Task 3 — `apps/api` NestJS com `GET /health` (AC1)**
  - [ ] Scaffold NestJS manual (sem `nest new` que traz git/strict opcional): `main.ts`, `app.module.ts`, estrutura `src/` conforme arquitetura seção 2.
  - [ ] RED: escrever teste e2e (`test/health.e2e-spec.ts`, supertest) esperando `GET /health` → `200` e body `{ status: 'ok' }`. Confirmar que falha.
  - [ ] GREEN: criar `HealthController` (`src/modules/health/health.controller.ts`) retornando `{ status: 'ok' }`; registrar no `AppModule`.
  - [ ] Adicionar teste unitário do controller.
  - [ ] Scripts em `apps/api/package.json`: `lint` (eslint), `typecheck` (`tsc --noEmit`), `test` (jest), `build` (`nest build` ou `tsc`), `start:dev`.
  - [ ] Verde: `pnpm --filter api test` passa; `pnpm --filter api build` gera `dist/`.

- [ ] **Task 4 — `apps/web` React + Vite com página inicial (AC1)**
  - [ ] Scaffold Vite + React + TS manual (estrutura mínima: `index.html`, `src/main.tsx`, `src/App.tsx`).
  - [ ] RED: teste (Vitest + @testing-library/react) `src/App.test.tsx` esperando render de um texto âncora (ex.: "Tamarcado"). Confirmar falha.
  - [ ] GREEN: `App.tsx` renderiza a página inicial com o texto.
  - [ ] Scripts em `apps/web/package.json`: `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `build` (`vite build`), `dev` (`vite`).
  - [ ] Verde: `pnpm --filter web test` e `pnpm --filter web build` passam.

- [ ] **Task 5 — `apps/mobile` placeholder (AC2)**
  - [ ] Criar `apps/mobile` como placeholder Expo mínimo OU pacote stub. **Crítico:** definir scripts `lint`, `typecheck`, `test`, `build` que saem com código 0 (no-op válido) para não quebrar o `pnpm -r` do CI. Incluir um `README.md` marcando "placeholder — implementado no Épico 5".
  - [ ] Verde: `pnpm --filter mobile test` e `pnpm --filter mobile build` retornam 0.

- [ ] **Task 6 — TypeORM + migration inicial `companies` (AC3)**
  - [ ] Adicionar TypeORM + driver `mysql2` ao `apps/api`. Criar `src/database/database.module.ts` e `src/database/typeorm.config.ts` (datasource para CLI de migrations), pasta `src/database/migrations/`.
  - [ ] RED: teste de integração (`test/migration-companies.e2e-spec.ts` ou script) que roda a migration contra o MySQL e verifica que a tabela `companies` existe com colunas `id`, `name`, `timezone` (default `America/Sao_Paulo`) e `created_at`. Confirmar falha.
  - [ ] GREEN: criar migration `CreateCompanies` gerando a tabela `companies` conforme arquitetura §3.1 **EXCETO** `whatsapp_provider` e `evolution_instance_name` (essas colunas são adicionadas na Story 2.1 — não criar agora). Colunas: `id`, `name`, `slug` (UNIQUE), `logo_url`, `primary_color` (default `#6C63FF`), `business_hours_start` (default `08:00:00`), `business_hours_end` (default `19:00:00`), `business_days` (default `mon,tue,wed,thu,fri,sat`), `timezone` (default `America/Sao_Paulo`), `is_active` (default TRUE), `created_at`, `updated_at`.
  - [ ] **Não criar** `users`, `clients`, `appointments` nem qualquer outra tabela (AC3: "sem criar tabelas que ainda não são necessárias").
  - [ ] Scripts de migration no `apps/api/package.json`: `migration:run`, `migration:generate`, `migration:revert`.
  - [ ] Verde: migration aplica e reverte limpo; teste passa.

- [ ] **Task 7 — `docker-compose.yml` dev (AC1, AC6)**
  - [ ] Criar `infra/docker/api.Dockerfile`, `infra/docker/web.Dockerfile` (dev com hot-reload).
  - [ ] Criar `infra/compose/docker-compose.yml` com serviços `api` (porta 3000), `web` (5173), `mysql` (mysql:8.0, db `tamarcado_dev`, porta 3306, volume), `redis` (redis:7-alpine, 6379), `evolution-api` (atendai/evolution-api:latest, 8080) — conforme arquitetura §8.1.
  - [ ] Criar `.env.example` na raiz com `DATABASE_URL`, `REDIS_URL`, `WHATSAPP_PROVIDER`, `EVOLUTION_API_URL`, `JWT_SECRET` (valores dev).
  - [ ] Criar `infra/scripts/seed-dev.sh` (stub que roda migrations; seed de dados completo é evolução das próximas stories).
  - [ ] Verde (validação manual documentada em Completion Notes): `docker compose -f infra/compose/docker-compose.yml up` sobe; `curl localhost:3000/health` → 200; `localhost:5173` renderiza; `mysql` e `redis` ativos.

- [ ] **Task 8 — `ci.yml` (AC4)**
  - [ ] Criar `.github/workflows/ci.yml` conforme arquitetura §9.1: trigger `push` em `['**']` + PR para `main`/`staging`; steps checkout, pnpm/action-setup v3 (version 9), setup-node v4 (node 20, cache pnpm); `pnpm install --frozen-lockfile`; `pnpm -r lint`; `pnpm -r typecheck`; `pnpm -r test`; `pnpm -r build`.
  - [ ] Garantir que **todos** os 5 workspaces têm os 4 scripts (lint/typecheck/test/build) — senão `pnpm -r` falha. Adicionar config de lint (eslint flat config ou `.eslintrc`) compartilhada.
  - [ ] Verde: `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` passa localmente (espelha o CI). Commitar o `pnpm-lock.yaml` (necessário para `--frozen-lockfile`).

- [ ] **Task 9 — `deploy.yml` + infra de produção (AC5)**
  - [ ] Criar `.github/workflows/deploy.yml` conforme arquitetura §9.2: trigger push em `main`; checkout, pnpm, node 20; `pnpm install --frozen-lockfile`; `pnpm -r build`; deploy via `appleboy/ssh-action@v1` usando secrets `PROD_VPS_HOST`, `PROD_SSH_KEY`; script remoto: `cd /opt/tamarcado && git pull origin main && pnpm install --frozen-lockfile --prod && pnpm -r build && pm2 restart tamarcado-api && cp -r apps/web/dist/* /var/www/tamarcado/`.
  - [ ] Criar `infra/scripts/deploy.sh` (versão script do passo remoto), `infra/nginx/tamarcado.conf` (proxy `/api`→3000, serve `web/dist` em `/`), `ecosystem.config.js` (PM2: processo `tamarcado-api`, porta 3000).
  - [ ] Documentar em `infra/README.md` os passos manuais do Renato: criar repo GitHub + remote, cadastrar secrets, provisionar VPS, instalar PM2/Nginx/Certbot.
  - [ ] Verde: `deploy.yml` é YAML válido (`actionlint` se disponível) e referencia os secrets corretos. (Execução real de deploy depende de VPS provisionado — fora do escopo automatizável desta story; validar sintaxe.)

- [ ] **Task 10 — Inicializar git + documentação de ambientes e custo (AC6)**
  - [ ] `git init` na raiz, primeiro commit (o repo ainda não é git — necessário porque `deploy.yml` faz `git pull origin main`).
  - [ ] Criar `infra/docker/evolution-api.Dockerfile` e `infra/compose/docker-compose.staging.yml` (build de produção, sem hot-reload/volumes de dev, db `tamarcado_staging`) conforme arquitetura §8.2 e ADR-010.
  - [ ] Criar `README.md` raiz documentando os 3 ambientes (Dev compose local R$0; Staging local R$0 via ADR-010; Produção VPS brasileiro ≤ R$130/mês via ADR-009/NFR-O1) e como rodar cada um.
  - [ ] Verde: `docker compose -f infra/compose/docker-compose.staging.yml config` valida sem erro.

## Dev Notes

### Stack e versões (arquitetura §1, §9)

- **Gerenciador de pacotes:** pnpm **9** (pinado via `packageManager` e usado no CI). Node **20** (`.nvmrc`).
- **Monorepo:** pnpm workspaces + **Turborepo** (`turbo.json`) — `turbo` é parte da estrutura definida (arquitetura §2). Sem starter template de terceiros (AC2): o scaffold é montado do zero.
- **Backend:** NestJS + TypeScript. Use a versão estável mais recente da linha NestJS (11.x) com TypeScript 5.x. Testes com **Jest + supertest** (padrão Nest).
- **Frontend web:** React + TypeScript + **Vite** (use Vite estável recente, 6.x). Testes com **Vitest + @testing-library/react**.
- **ORM/migrations:** **TypeORM** com driver `mysql2` (arquitetura §2 define `database/typeorm.config.ts` e `database/migrations/`). MySQL **8.0**.
- **Cache/filas:** Redis 7 + BullMQ (BullMQ não é exercitado nesta story, mas o serviço Redis sobe no compose).

### Escopo cirúrgico — o que NÃO fazer nesta story

- **NÃO** criar tabelas além de `companies` (AC3). `users`, `clients`, `appointments`, etc. pertencem a stories posteriores (ordem de criação DL-020, arquitetura §3).
- **NÃO** incluir `whatsapp_provider` nem `evolution_instance_name` na tabela `companies` — **a Story 2.1 adiciona essas colunas** explicitamente ("companies ganha `whatsapp_provider` e `evolution_instance_name`"). Criá-las agora gera conflito de migration.
- **NÃO** implementar multi-tenancy (`TenantMiddleware`/`TenantAwareRepository`), auth, nem nenhum módulo de domínio — são Stories 1.2/1.3+. Esta story entrega só o esqueleto + pipeline.
- **NÃO** usar `@nestjs/terminus` para o health a menos que necessário: um `HealthController` simples retornando `{ status: 'ok' }` satisfaz AC1 sem dependência extra.

### Estrutura de arquivos alvo (arquitetura §2)

Replicar a árvore da arquitetura §2 (raiz `tamarcado/`): `apps/{api,web,mobile}`, `packages/{shared-types,shared-utils}`, `infra/{docker,compose,nginx,scripts}`, `.github/workflows/{ci.yml,deploy.yml}`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`. A estrutura interna de `apps/api/src/` segue o layout da arquitetura §2 (criar agora apenas `main.ts`, `app.module.ts`, `modules/health/`, `database/`; os demais módulos são placeholders de diretório vazios ou criados sob demanda nas próximas stories — **não** crie módulos vazios desnecessários).

### Migration `companies` (arquitetura §3.1)

Schema canônico em arquitetura §3.1. Para esta story, criar todas as colunas **menos** `whatsapp_provider` e `evolution_instance_name` (Story 2.1). `timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo'` é obrigatório (AC3, ADR-008 — nunca timezone global hardcoded). Banco roda em UTC (`time_zone = 'UTC'`), conversão na aplicação em stories futuras.

### Ambientes (arquitetura §8, ADR-009, ADR-010)

- **Dev:** `infra/compose/docker-compose.yml`, tudo local, hot-reload, R$0 (§8.1).
- **Staging:** **local** na máquina do dev, `docker-compose.staging.yml`, build de produção sem hot-reload, R$0 — **não é clone em nuvem** (ADR-010/DL-017). Não confundir.
- **Produção:** VPS brasileiro (Hostinger preferencial / HostGator), São Paulo, PM2 + Nginx + Certbot, R$45–96/mês ≤ R$130 (NFR-O1, ADR-009). Deploy via SSH. Layout `/opt/tamarcado/` (§8.3).

### CI/CD (arquitetura §9)

- `ci.yml`: roda em `push: ['**']` e PR. Sequência exata: install `--frozen-lockfile` → `pnpm -r lint` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm -r build`. **Qualquer** falha quebra o pipeline (AC4). Por isso todo workspace, incluindo `mobile` placeholder, precisa dos 4 scripts retornando 0.
- `deploy.yml`: roda em push `main`. Faz build e deploy SSH (PM2 restart + cópia do web build para o Nginx serve dir). Secrets: `PROD_VPS_HOST`, `PROD_SSH_KEY` (e `PROD_DATABASE_URL` injetado via `.env.production` no VPS, **não** pelo Actions — §9.3).
- **Pré-requisito de repo:** o projeto ainda **não é um repositório git** (Task 10 faz `git init`). O `deploy.yml` depende de `git pull origin main` no VPS — criar o repositório GitHub, configurar o remote e cadastrar os secrets é **passo manual do Renato** (documentar em `infra/README.md`); o dev entrega os workflows e scripts prontos.

### Testing standards

- API: Jest unit + e2e (supertest) — health endpoint coberto por ambos.
- Web: Vitest + @testing-library/react — smoke render de `App`.
- shared-utils: Vitest sobre função pura.
- Migration: teste de integração/script contra MySQL verificando existência/colunas de `companies` (pode usar o MySQL do compose ou um container efêmero). Se rodar em ambiente sem MySQL disponível, marcar o teste como integração e documentar a execução manual em Completion Notes — mas **a migration deve ser comprovadamente aplicável** (AC3 não é satisfeita por "código que parece certo").
- Validações de infra (compose up, deploy.yml) que dependem de Docker/VPS: validar o que for automatizável (`docker compose config`, lint de YAML) e registrar a verificação manual em Completion Notes.

### Project Structure Notes

- Alinhado 1:1 com a árvore da arquitetura §2. Nenhuma variância planejada.
- Nomes de pacote sugeridos: `@tamarcado/shared-types`, `@tamarcado/shared-utils`, `api`, `web`, `mobile`.
- Possível atrito: dois test runners (Jest na API, Vitest no web/packages). É aceitável e esperado em monorepo; o `pnpm -r test` agrega ambos. Não unificar agora.

### References

- [Source: architecture.md#2. Estrutura do Monorepo] — árvore de diretórios, estrutura interna do API.
- [Source: architecture.md#3.1 `companies` (tenants)] — schema da tabela `companies`.
- [Source: architecture.md#3. Modelo de Dados / DL-020] — ordem de criação de tabelas; só `companies` nesta story.
- [Source: epics.md#Story 2.1] — `companies` ganha `whatsapp_provider` e `evolution_instance_name` (NÃO criar nesta story).
- [Source: architecture.md#8. Ambientes / ADR-009 / ADR-010] — dev, staging local, produção VPS BR, custo.
- [Source: architecture.md#9. Pipeline CI/CD] — `ci.yml` e `deploy.yml` completos + secrets.
- [Source: architecture.md#ADR-008] — timezone por tenant, default `America/Sao_Paulo`.
- [Source: epics.md#Story 1.1] — acceptance criteria originais.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia)

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
