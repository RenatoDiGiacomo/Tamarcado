# Story 1.5: Catálogo de serviços

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a dono de salão,
I want cadastrar e manter os serviços oferecidos com nome, duração e preço,
so that eles fiquem disponíveis para agendamento e configuração.

## Acceptance Criteria

1. **(AC1 — Migration)** Dada a migration desta story, quando aplicada, então as tabelas `salon_services` e `professional_services` são criadas, com `company_id` e índices liderados por ele (architecture.md §3.4, §3.5), e revertem limpo.

2. **(AC2 — CRUD de serviço, somente Dono)** Dado que sou o Dono, quando crio/edito/inativo um serviço (nome, duração em minutos, preço), então a mudança é persistida e validada (FR-G1, UX-DR13 — subseção Serviços). Mutações exigem `@Roles('owner')` → não-Dono recebe 403 (matriz FR-I2).

3. **(AC3 — Lista para agendamento exclui inativos)** Dado um serviço inativado, quando listo serviços para agendamento, então ele **não** aparece (apenas `is_active = true`). A listagem é tenant-scoped e disponível a qualquer usuário autenticado do tenant (não só Dono — gestão/básico precisam ver serviços para agendar).

4. **(AC4 — Associação profissional ↔ serviço)** Dada a associação profissional↔serviço, quando defino quais serviços um profissional executa, então a relação é persistida em `professional_services` (tenant-scoped). Só profissionais do tenant com `attends_clients = true` podem ser associados (DECISÃO PENDENTE 4).

## Pré-requisitos e contexto (Stories 1.1–1.4 — no `main`, build limpo validado)

- **Multi-tenancy (1.3):** `TenantMiddleware` por controller via `TENANT_AWARE_CONTROLLERS` (`app.module.ts`); `TenantAwareRepository<T>` injeta `WHERE company_id = ?`. **Guard-rail 1.3.01:** todo controller novo que toca tabela tenant-aware **precisa** ser registrado em `src/modules/tenant/tenant-aware-controllers.ts`, senão `tenant-coverage.spec.ts` quebra a suíte. **Esta story adiciona o `ServicesController` → registrar lá.**
- **Permissões (1.4):** `@Roles(...)` + `RolesGuard` (`modules/auth/guards/roles.guard.ts`); `ActiveUserGuard` (revoga inativo na hora). Padrão aplicado no `UsersController`: `@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)` na classe + `@Roles('owner')` nas mutações. **Replicar no `ServicesController`.** Matriz FR-I2: "Configurar serviços, horários e intervalos" = **somente Dono**.
- **Migrations:** padrão em `database/migrations/` (ver `1718900200000-CreateUserInvites.ts`); registrar entidade+migration em `data-source-options.ts` (arrays `entities`/`migrations`) e `typeorm.config.ts` é automático (usa `buildDataSourceOptions`). Incluir as tabelas novas no `KNOWN_TABLES` do `test/test-db.ts` (reset FK-safe, em ordem reversa de dependência).
- **Schema alvo (architecture.md §3.4/§3.5):**
  - `salon_services`: `id`, `company_id`, `name VARCHAR(100)`, `duration_minutes INT`, `price DECIMAL(10,2) NULL` (DL-030 — opcional), `is_active BOOLEAN DEFAULT TRUE`, timestamps; `KEY idx_services_company_active (company_id, is_active)`; FK `company_id → companies`.
  - `professional_services` (join): PK composta `(professional_id, service_id)`, `company_id` (desnormalizado), `KEY idx_prof_services_company_service (company_id, service_id)`; FK `professional_id → users`, `service_id → salon_services`.
- **Ordem de migrations (DL-020):** `salon_services`/`professional_services` no Épico 1 (esta story), antes de `clients`/`appointments` (Épico 2). `professional_schedules` é a Story 1.6.
- **Testes e2e:** reusar `test/e2e-app.ts` (`bootstrapE2E`/`teardownE2E`) e `test/test-db.ts`; `jest.setTimeout(60000)` no topo da suíte nova (cold-start do AppModule passa dos 5s padrão — flake conhecido). Sem `--forceExit`.
- Fluxo Git: branch `story/1.5-catalogo-de-servicos` (já criada do `main`); commits pequenos; PR no fim (merge é do Renato). Versionamento: planejado = `1.5`; ajustes fora de escopo = `1.5.NN` (DL-028).

## Tasks / Subtasks

> Ordem TDD (red→green→refactor). Rode a suíte com MySQL acessível. Não marque `[x]` sem teste passando. Decisões aprovadas (ver seção "Decisões aprovadas" e DL-030) — destaque: `price` é **nullable**.

- [ ] **Task 1 — Entidades + migration `salon_services` e `professional_services` (AC1)**
  - [ ] `database/entities/salon-service.entity.ts` e `database/entities/professional-service.entity.ts` (espelhar §3.4/§3.5; `professional_services` com PK composta).
  - [ ] Migration nova (timestamp > `1718900200000`): cria as duas tabelas, índices liderados por `company_id`, FKs. `down` dropa ambas (ordem FK-safe: `professional_services` antes de `salon_services`).
  - [ ] Registrar entidades+migration em `data-source-options.ts`; incluir `professional_services` e `salon_services` em `KNOWN_TABLES` (`test-db.ts`), antes de `users`/`companies`.
  - [ ] RED→GREEN: e2e de migration (espelhar `migration-user-invites.e2e-spec.ts`): colunas, índice por `company_id`, FKs, reversão limpa. (Atenção: `information_schema.NON_UNIQUE` volta como string via TypeORM → comparar com `Number(...)`.)

- [ ] **Task 2 — `ServicesModule` + repositório tenant-aware (AC2, AC3)**
  - [ ] `modules/services/services.module.ts`, `services.repository.ts` (`SalonServicesRepository extends TenantAwareRepository<SalonService>`), `services.service.ts`, `services.controller.ts`.
  - [ ] Importar `TenantModule` (para `TenantContextService`) e `TypeOrmModule.forFeature([SalonService, ProfessionalService])`. Prover `ActiveUserGuard` no módulo (como em `UsersModule`, evita ciclo com `AuthModule`).
  - [ ] **Registrar `ServicesController` em `TENANT_AWARE_CONTROLLERS`** (guard-rail 1.3.01) e no `AppModule.configure` via essa lista (automático).

- [ ] **Task 3 — CRUD de serviço (AC2, AC3)**
  - [ ] `POST /api/services` (`@Roles('owner')`): cria serviço tenant-scoped (DTO: `name`, `duration_minutes`, `price?`). Validar `duration_minutes > 0`; `price` **opcional** (nullable, DL-030) — quando informado, `@IsNumber`/`@Min(0)`.
  - [ ] `PATCH /api/services/:id` (`@Roles('owner')`): edita nome/duração/preço/`is_active` (tenant-scoped; id de outro tenant → 404).
  - [ ] `GET /api/services` (qualquer autenticado do tenant): lista. Query `?activeOnly=true` (ou rota `/available`) retorna só `is_active = true` (AC3).
  - [ ] Serialização: `price DECIMAL` volta como **string** do MySQL/TypeORM — normalizar no DTO de saída (ex.: `Number(price)` ou string formatada — decidir no Dev, manter consistente).
  - [ ] RED→GREEN e2e: Dono cria/edita/inativa; não-Dono → 403; inativo some da lista `activeOnly`.

- [ ] **Task 4 — Associação profissional ↔ serviço (AC4)**
  - [ ] Endpoint(s) de associação (DECISÃO PENDENTE 3 — formato). Default proposto: `PUT /api/services/:id/professionals` body `{ professionalIds: string[] }` (define quem executa o serviço), `@Roles('owner')`, tenant-scoped. Persistir em `professional_services` com `company_id` carimbado.
  - [ ] Validar que cada `professionalId` é usuário do tenant e `attends_clients = true` (DECISÃO PENDENTE 4); ignorar/erro caso contrário.
  - [ ] `GET` para leitura da associação (ex.: `GET /api/services/:id/professionals`).
  - [ ] RED→GREEN e2e: associa profissionais a um serviço; só do tenant; persiste e lê de volta.

- [ ] **Task 5 — Validação final (todas as ACs)**
  - [ ] Sequência CI em ambiente limpo, MySQL acessível: `pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test` — verde, sem `--forceExit`, **guard-rail 1.3.01 verde** (ServicesController coberto).
  - [ ] Conferir manualmente (compose): Dono cria serviços; gestão/básico veem a lista mas não conseguem criar (403); serviço inativo some da lista de agendamento.

## Dev Notes

### Fronteiras de escopo — o que NÃO fazer

- **NÃO** implementar `professional_schedules` nem `AvailabilityService`/cálculo de disponibilidade — é a Story 1.6 / Épico 2. Aqui só o catálogo + associação profissional↔serviço.
- **NÃO** criar `clients`/`appointments` (Épico 2). A FK de `appointments → salon_services` é criada lá, não aqui.
- **NÃO** quebrar regressões 1.1–1.4: login/refresh, `/users/*`, isolamento A↔B, guard-rail 1.3.01, convite/permissões.
- **NÃO** adicionar controller tenant-aware sem registrar no guard-rail (`TENANT_AWARE_CONTROLLERS`).

### Tenant-scoping (reuso 1.3)

- `salon_services` encaixa direto em `TenantAwareRepository<SalonService>` (tem `id` + `company_id`): `findAll`/`findById`/`save`/`count` já carimbam/filtram `company_id`.
- **`professional_services` é tabela de junção (PK composta, sem `id` único)** → **não** usa `TenantAwareRepository.findById`. Fazer queries explícitas com `company_id = tenantContext.getCompanyId()` no `where` (ou um pequeno repositório dedicado). Carimbar `company_id` ao inserir.

### Autorização (reuso 1.4)

- `ServicesController`: `@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)` na classe. Mutações (`POST`/`PATCH`/`PUT associação`) com `@Roles('owner')`. `GET` sem `@Roles` (qualquer autenticado do tenant lê — necessário para agendar). Matriz FR-I2: "Configurar serviços…" é owner-only.

### DECIMAL / serialização

- `price DECIMAL(10,2)`: o driver MySQL/TypeORM retorna **string** (ex.: `"50.00"`). Definir o contrato de saída da API (número ou string) e manter consistente no DTO de resposta. Entrada: validar como número com 2 casas (`@IsNumber`, `@Min(0)`).

### File structure (architecture.md §1, §4.5)

- `apps/api/src/database/entities/salon-service.entity.ts`, `professional-service.entity.ts`
- `apps/api/src/database/migrations/<ts>-CreateServices.ts` + registro em `data-source-options.ts`
- `apps/api/src/modules/services/{services.module.ts, services.controller.ts, services.service.ts, services.repository.ts, dto/*.dto.ts}`
- `apps/api/src/modules/tenant/tenant-aware-controllers.ts` (registrar `ServicesController`)
- Testes: `apps/api/test/{services.e2e-spec.ts, migration-services.e2e-spec.ts}`; `test/test-db.ts` (KNOWN_TABLES)

### Testing

- Unit: regra de associação (filtra não-tenant / não-atendente) se a lógica justificar; serialização de `price`.
- e2e (MySQL real, `--runInBand`): CRUD de serviço (Dono) + 403 (não-Dono); `activeOnly` exclui inativos; associação profissional↔serviço persiste e isola por tenant; migration aplica/reverte. Teardown limpo, sem `--forceExit`; `jest.setTimeout(60000)`.

### References

- [Source: epics.md#Story 1.5] — ACs originais (FR-G1, UX-DR13).
- [Source: prd.md#FR-G1] — Dono configura nome, duração e preço dos serviços; [#FR-I2] — "Configurar serviços…" é owner-only.
- [Source: architecture.md#3.4 salon_services] e [#3.5 professional_services] — schemas/índices/FKs; [#4.5 ServicesModule] — responsabilidades; [#1 estrutura].
- [Source: ux-spec.md#Servicos] — lista (`+ Adicionar`, `Editar`, `[x]`) e formulário (Nome, Duração em min, Preço); **marca "Preço (opcional)"** — ver DECISÃO PENDENTE 1.
- [Source: .decision-log.md#DL-020] — ordem de migrations (salon_services antes de appointments); [#DL-028] — versionamento 1.5.NN.

### Decisões aprovadas (Renato, 2026-06-30 — ver DL-030)

1. **Preço OPCIONAL (`price` nullable).** Divergência consciente do default proposto: salão tem muito serviço "sob consulta"/preço variável (ex.: coloração depende do cabelo); forçar obrigatório faria o Dono inventar número. A UX ("Preço opcional") estava certa. **Ação:** `salon_services.price DECIMAL(10,2) NULL` (diverge do §3.4 que dizia `NOT NULL`); DTO de entrada com `price` opcional; saída pode ser `null`.
2. **Inativar (soft delete):** `[x]` = `is_active = false` (preserva histórico futuro de agendamentos). Sem hard-delete.
3. **Associação:** `PUT /api/services/:id/professionals { professionalIds: string[] }` (define quem executa o serviço), `@Roles('owner')`, tenant-scoped.
4. **Restringir associação a `attends_clients = true`:** sim — só associa serviço a quem atende.
5. **Escopo da associação na 1.5:** endpoints + persistência (satisfaz AC4); a tela/fluxo completo fica para o Épico 2 consumir.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
