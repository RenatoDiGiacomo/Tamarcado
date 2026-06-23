# Story 1.3: Multi-tenancy e isolamento de dados

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a operador da plataforma,
I want que toda consulta seja automaticamente filtrada pela instalação do usuário autenticado,
so that nenhum dado vaze entre salões.

## Acceptance Criteria

1. **(AC1 — TenantMiddleware)** Dada uma requisição autenticada, quando o `TenantMiddleware` processa, então valida que a empresa está ativa e injeta `company_id` no `AsyncLocalStorage`.
2. **(AC2 — Filtro automático)** Dado um repositório que herda de `TenantAwareRepository<T>`, quando qualquer query é executada, então o filtro `WHERE company_id = ?` é aplicado automaticamente, sem o desenvolvedor precisar adicioná-lo (NFR-S1).
3. **(AC3 — Isolamento PROVADO por teste)** Dados dois salões (A e B) com dados distintos, quando o usuário do salão A consulta qualquer recurso tenant-aware, então **nenhum** registro do salão B é retornado; e quando A tenta acessar um `id` pertencente a B, o registro **não é encontrado** (comporta-se como inexistente — 404). **Isto é verificado por um teste e2e automatizado com dois tenants reais — não basta o `TenantAwareRepository` existir** (NFR-S1, NFR-S2, FR-I4).
4. **(AC4 — Empresa inválida/inativa)** Dado um token cujo `companyId` referencia uma empresa inexistente ou `is_active = false`, quando o middleware avalia, então o acesso é negado (não prossegue para os dados).
5. **(AC5 — Teardown de conexão na raiz)** Dados os testes e2e, quando a suíte termina, então o processo Jest encerra **sem `--forceExit`** porque cada arquivo fecha o app (`app.close()`) e/ou destrói o `DataSource` no `afterAll`. Validado com `jest --detectOpenHandles` sem handles remanescentes. O `--forceExit` introduzido na Story 1.2 é **removido** ao final.

## Pré-requisitos e contexto (Stories 1.1 e 1.2 — no `main`)

- `apps/api` NestJS 11 com `setGlobalPrefix("api", { exclude: ["health"] })`, `ValidationPipe` global, `ConfigModule` global.
- Auth JWT (1.2): access token carrega `{ sub, companyId, accessLevel, attendsClients }`. `JwtStrategy`/`JwtAuthGuard` em `modules/auth`. `JWT_SECRET` em env.
- Entidades `Company` (§3.1) e `User` (§3.2). `UsersService.findByCompanyAndEmail` / `findById`. `GET /api/users/me` protegido por `JwtAuthGuard`.
- TypeORM: `database/{data-source-options,database.module,typeorm.config}.ts`; entidades em `entities/`, migrations em `migrations/`. Índices de domínio já liderados por `company_id` (§6.3) — esta story **não** cria migration.
- e2e atuais usam `test/test-db.ts` (`createTestDataSource`/`resetSchema`/`dropSchema`) e seed inline; rodam com `--runInBand`. **Hoje dependem de `--forceExit` (a remover nesta story).**
- Fluxo Git: branch `story/1.3-multi-tenancy`; commits pequenos; PR no fim (não mergear).

## Tasks / Subtasks

> Ordem TDD (red→green→refactor). Rode a suíte com MySQL acessível. Não marque `[x]` sem teste passando.

- [ ] **Task 1 — `TenantContextService` (AsyncLocalStorage) + `TenantModule` (AC1, AC2)**
  - [ ] `common/tenant/tenant-context.service.ts`: encapsula um `AsyncLocalStorage<{ companyId: string }>` (de `node:async_hooks`). Expõe `run(companyId, callback)`, `getCompanyId(): string` (lança se não setado) e `getCompanyIdOrNull()`.
  - [ ] `modules/tenant/tenant.module.ts`: provê e exporta `TenantContextService` (e o `TenantMiddleware`). Importa o necessário (`JwtModule`/`ConfigModule`, `TypeOrmModule.forFeature([Company])`).
  - [ ] RED→GREEN: teste unitário do `TenantContextService` (dentro de `run`, `getCompanyId()` retorna o valor; fora, lança).

- [ ] **Task 2 — `TenantMiddleware` (AC1, AC4)**
  - [ ] `modules/tenant/tenant.middleware.ts`: extrai o Bearer token; **verifica** com `JWT_SECRET` (não apenas decodifica — segurança); pega `companyId` do payload; valida no repositório de `Company` que existe e `is_active = true`; então chama `tenantContext.run(companyId, () => next())`.
  - [ ] Sem token (rota pública) → `next()` sem setar tenant. Token inválido → `next()` (o `JwtAuthGuard` da rota responde 401). Empresa inexistente/inativa → `ForbiddenException` (403).
  - [ ] Wiring (`AppModule implements NestModule.configure`): aplica o `TenantMiddleware` a todas as rotas **exceto** `auth/(.*)` e `health` (login/refresh acontecem antes de existir tenant — DL-026).
  - [ ] RED→GREEN: e2e — token de empresa inativa → 403; rota pública (login) funciona sem tenant.
  - [ ] **CRÍTICO (ordem NestJS):** middleware roda ANTES dos guards. Por isso o middleware verifica o token por conta própria (não depende do `JwtAuthGuard`, que roda depois). Documentar.

- [ ] **Task 3 — `TenantAwareRepository<T>` (AC2)**
  - [ ] `common/repository/tenant-aware.repository.ts`: classe base abstrata sobre `Repository<T>` + `TenantContextService` (architecture.md §6.2). Métodos `findAll`/`findOne`/`save`/`update`/`delete` injetam `company_id = tenantContext.getCompanyId()` automaticamente no `where`/payload. Querys de leitura nunca retornam outro tenant; writes sempre carimbam o `company_id` atual.
  - [ ] RED→GREEN: teste unitário com `TenantContextService` real + repositório TypeORM mockado, provando que o `where company_id` é injetado em `findAll`/`findOne` e o `company_id` é setado no `save`.

- [ ] **Task 4 — Tornar `users` tenant-aware + endpoints de leitura (AC2, AC3)**
  - [ ] `modules/users/users.repository.ts`: `UsersRepository extends TenantAwareRepository<User>` (injeta `@InjectRepository(User)` + `TenantContextService`). `UsersService` passa a usar o `UsersRepository` para `findById`/`findAll` (mantendo `findByCompanyAndEmail` para o login, que é **pré-tenant** e continua explícito por `company_id`).
  - [ ] `GET /api/users` (protegido): lista os usuários do tenant atual (via repo tenant-aware). `GET /api/users/:id` (protegido): busca tenant-scoped (id de outro tenant → 404). `GET /api/users/me` continua funcionando (o próprio registro está no tenant).
  - [ ] **Regressão:** não quebrar login (`AuthService` segue resolvendo company pré-tenant e usando `findByCompanyAndEmail` explícito) nem `/users/me`.

- [ ] **Task 5 — PROVA de isolamento (AC3, AC4) — teste e2e com dois tenants**
  - [ ] `test/tenant-isolation.e2e-spec.ts`: cria company A + user A (owner) e company B + user B; faz login como A (token A).
  - [ ] `GET /api/users` com token A → retorna **apenas** usuários de A (o user de B **não** aparece).
  - [ ] `GET /api/users/:idDoUserB` com token A → **404** (inexistente sob o tenant A).
  - [ ] `GET /api/users/:idDoUserA` com token A → 200 (controle positivo).
  - [ ] Token de company inativa → 403 (AC4).
  - [ ] (Opcional, reforço) repetir simetricamente com token B para garantir que A também não vaza para B.

- [ ] **Task 6 — Teardown de conexão na raiz + remover `--forceExit` (AC5)**
  - [ ] Criar `test/e2e-app.ts`: `bootstrapE2E()` que compila o `AppModule`, cria a app (com `setGlobalPrefix` + `ValidationPipe` iguais ao `main.ts`), e retorna `{ app, dataSource }` onde `dataSource = app.get(DataSource)` — **uma única conexão** (a do app), evitando abrir um `DataSource` paralelo. `teardownE2E({ app })` faz `await app.close()` (fecha a conexão TypeORM do app).
  - [ ] Migrar `auth.e2e-spec.ts`, `tenant-isolation.e2e-spec.ts` e (onde fizer sentido) os de migration para fechar **tudo** no `afterAll` (`app.close()` e/ou `dataSource.destroy()`), sem deixar pool aberto. Para os testes que só usam `DataSource` (migrations), garantir `destroy()` no `afterAll`.
  - [ ] Rodar `pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand --detectOpenHandles` e **eliminar** qualquer handle reportado (provável raiz: `DataSource` paralelo não destruído / `app.close()` ausente). 
  - [ ] Só então **remover `--forceExit`** dos scripts `test`/`test:e2e` no `apps/api/package.json` e confirmar que a suíte encerra sozinha (exit 0) em ambiente limpo.

- [ ] **Task 7 — Validação final (todas as ACs)**
  - [ ] Sequência CI via Turbo em ambiente limpo (sem `dist/`), MySQL acessível: `pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test` — verde e **encerra sem forceExit**.
  - [ ] Conferir manualmente (compose): com dois salões semeados, o usuário de um não enxerga dados do outro.

## Dev Notes

### Escopo cirúrgico — o que NÃO fazer

- **NÃO** aplicar tenant-scoping em `companies` nem no fluxo de **auth**. `companies` é o registro de tenants (consultado por `id`/`slug` no login e no middleware, **sem** filtro de tenant). `AuthService.resolveCompanyId`/login continuam **pré-tenant** (não há contexto de tenant antes do login — DL-026).
- **NÃO** criar migration nesta story (o schema e os índices liderados por `company_id` já existem — §6.3).
- **NÃO** implementar `RolesGuard`/matriz de permissões (Story 1.4). O isolamento aqui é por `company_id`, não por papel.
- **NÃO** quebrar a 1.2: login, `/api/users/me`, refresh devem continuar passando.
- **NÃO** introduzir biblioteca de CLS de terceiros — usar `AsyncLocalStorage` nativo (`node:async_hooks`).

### Estratégia de isolamento (architecture.md §6)

- Fluxo por request (§6.1): `JwtAuthGuard` (auth) + `TenantMiddleware` (tenant) + `TenantAwareRepository` (filtro). **Atenção à ordem real do NestJS:** middlewares rodam **antes** dos guards. Por isso o `TenantMiddleware` **verifica o token ele mesmo** (com `JWT_SECRET`) para obter o `companyId` — não depende do `req.user` populado pelo guard (que ainda não rodou).
- `AsyncLocalStorage`: o middleware faz `tenantContext.run({ companyId }, () => next())`. Usar `run(...)` (envolve o restante do request no contexto), **não** `enterWith` solto. O `TenantAwareRepository` lê `tenantContext.getCompanyId()`; se não houver contexto, **lança** (sinaliza rota tenant-aware sem middleware — bug, não vazamento).
- `TenantAwareRepository<T>` (§6.2): injeta `company_id` em `findAll`/`findOne` (no `where`) e carimba em `save`/`update`. Lookups por `id` viram `where { id, company_id }` → id de outro tenant retorna `null` → controller responde 404.
- Índices: já liderados por `company_id` (§6.3) — nada a criar.

### Verificação de segurança no middleware

- Verificar o token (assinatura + expiração) com o mesmo `JWT_SECRET` do `JwtStrategy`. Decodificar sem verificar permitiria forjar `companyId` e furar o isolamento — **não fazer**.
- Validar `company.is_active`: empresa inativa → 403 (AC4). Empresa inexistente → 403.

### Teardown de testes (AC5) — resolver na raiz

- Causa provável do handle aberto (1.2): abrir um `DataSource` paralelo (`createTestDataSource`) **além** da conexão do app, e/ou não aguardar `app.close()`. Cada conexão mysql2 mantém sockets que seguram o event loop.
- Padrão alvo: **uma conexão por arquivo e2e** — usar `app.get(DataSource)` da app já criada para semear/limpar, e `await app.close()` no `afterAll` (fecha o pool). Para arquivos que só testam migration (sem app), um único `DataSource` destruído no `afterAll`.
- Validar com `--detectOpenHandles` (sem `--forceExit`). Só remover o `--forceExit` quando a suíte encerrar limpa. Se sobrar handle de terceiro genuinamente inevitável, documentar — mas o esperado é zerar.

### File structure (architecture.md §2)

- `apps/api/src/common/tenant/tenant-context.service.ts`
- `apps/api/src/common/repository/tenant-aware.repository.ts`
- `apps/api/src/modules/tenant/{tenant.module.ts, tenant.middleware.ts}`
- `apps/api/src/modules/users/users.repository.ts` (novo) + ajustes em `users.service.ts`/`users.controller.ts`
- `apps/api/src/app.module.ts` (configure middleware)
- Testes: `test/tenant-isolation.e2e-spec.ts`, `test/e2e-app.ts` (helper), unit specs de `TenantContextService` e `TenantAwareRepository`

### Testing

- Unit: `TenantContextService` (contexto dentro/fora do `run`); `TenantAwareRepository` (injeção do `where company_id` e carimbo no save) com repo TypeORM mockado.
- e2e (MySQL real, `--runInBand`): isolamento A/B (AC3), empresa inativa 403 (AC4), regressão de login/`/users/me`. Teardown limpo (AC5).
- Reaproveitar `test/test-db.ts` (resetSchema FK-safe) para preparar o schema; semear A e B via `app.get(DataSource)`.

### References

- [Source: architecture.md#6. Estratégia de Multi-tenancy] — fluxo §6.1, `TenantAwareRepository` §6.2, índices §6.3.
- [Source: architecture.md#4.2 TenantModule] — middleware, repositório base, CRUD de company fora do escopo de tenant.
- [Source: epics.md#Story 1.3] — ACs originais (NFR-S1, NFR-S2, FR-I4).
- [Source: .decision-log.md#DL-022, DL-026] — companyId no JWT; tenant resolvido no login.

### Pendências/decisões

- Ordem middleware-antes-de-guard resolvida com verificação de token no próprio middleware.
- `RolesGuard`/permissões → Story 1.4. CRUD de usuários completo (criar/editar/desativar) → Story 1.4; aqui só leitura tenant-scoped para provar isolamento.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
