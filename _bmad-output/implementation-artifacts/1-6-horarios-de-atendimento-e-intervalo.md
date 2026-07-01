# Story 1.6: Horários de atendimento e intervalo

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a dono de salão,
I want configurar os dias e faixas de horário de atendimento de cada profissional e o intervalo entre atendimentos,
so that a disponibilidade da agenda reflita a realidade do salão.

## Acceptance Criteria

1. **(AC1 — Migration)** Dada a migration desta story, quando aplicada, então a tabela `professional_schedules` é criada com `company_id`, `professional_id`, `day_of_week`, faixa (`start_time`/`end_time`), `is_active` e índice liderado por `company_id` (architecture.md §3.6); **e o armazenamento do intervalo** (FR-G3) é criado (ver DECISÃO PENDENTE 1). Reverte limpo.

2. **(AC2 — Horários por profissional, somente Dono)** Dado que sou o Dono, quando configuro por profissional os dias ativos e a faixa de horário (início/fim), então a configuração é persistida (FR-G2, UX-DR13 — subseção Horários). Só usuários do tenant com `attends_clients = true` podem ter horários (§4.6). Mutações exigem `@Roles('owner')` → não-Dono recebe 403 (matriz FR-I2).

3. **(AC3 — Intervalo entre atendimentos, somente Dono)** Dado o intervalo entre atendimentos consecutivos, quando defino esse valor (minutos), então ele é persistido e ficará disponível para o cálculo de disponibilidade (FR-G3). *(O consumo pelo `AvailabilityService` é do Épico 2 — ver Fronteiras de escopo.)*

4. **(AC4 — Validação de faixa)** Dada uma faixa de horário inválida (`end_time` ≤ `start_time`), quando tento salvar, então a validação impede e retorna erro (400).

## Pré-requisitos e contexto (Stories 1.1–1.5.01 — no `main`, build limpo validado)

- **Multi-tenancy (1.3):** `TenantMiddleware` por controller via `TENANT_AWARE_CONTROLLERS`; `TenantAwareRepository<T>` injeta `WHERE company_id = ?`. **Guard-rail 1.3.01:** controller novo tenant-aware **precisa** entrar em `src/modules/tenant/tenant-aware-controllers.ts`. **Esta story adiciona o `SchedulesController` → registrar lá.**
- **Permissões (1.4):** `@Roles(...)` + `RolesGuard`; `ActiveUserGuard`. Padrão do `UsersController`/`ServicesController`: `@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)` + `@Roles('owner')` nas mutações. Matriz FR-I2: "Configurar serviços, horários e intervalos" = **somente Dono**.
- **Padrão de serviços (1.5) a espelhar:** `SalonServicesRepository extends TenantAwareRepository<T>`; validação de `attends_clients=true` reusando `UsersService.listAttenders()` (importar `UsersModule`); DECIMAL/serialização não se aplica aqui, mas `TIME` sim (ver Dev Notes).
- **Swagger (1.5.01):** plugin do Nest ativo (`nest-cli.json`, `introspectComments`). **Documentar os endpoints novos** com `@ApiTags('schedules')` + `@ApiBearerAuth()` (pedido do Renato) — aparecem em `/api/docs`.
- **Migrations:** padrão em `database/migrations/` (`1718900300000-CreateServices.ts` é a última). Registrar entidade+migration em `data-source-options.ts`; incluir `professional_schedules` no `KNOWN_TABLES` do `test-db.ts` (reset FK-safe, antes de `users`/`companies`). Testes de revert já são imunes a novas migrations (`ds.migrations.length`).
- **Schema alvo (architecture.md §3.6):** `professional_schedules(id, company_id, professional_id, day_of_week TINYINT [0=Dom..6=Sab], start_time TIME, end_time TIME, is_active BOOLEAN DEFAULT TRUE)`; `KEY idx_pschedules_company_prof_day (company_id, professional_id, day_of_week)`; FK `professional_id → users`. *(§3.6 não lista FK para `companies` — ver DECISÃO PENDENTE 3.)*
- **Ordem de migrations (DL-020):** `professional_schedules` no Épico 1 (esta story).
- Fluxo Git: branch `story/1.6-horarios-de-atendimento-e-intervalo` (já criada do `main`); commits pequenos; PR no fim (merge é do Renato). Versionamento: planejado = `1.6`; ajustes fora de escopo = `1.6.NN` (DL-028).

## Tasks / Subtasks

> Ordem TDD (red→green→refactor). Rode a suíte com MySQL acessível. Não marque `[x]` sem teste passando. Decisões aprovadas (ver seção "Decisões aprovadas" e DL-032): intervalo por profissional (`users.slot_interval_minutes`, `0–120`); PUT substitui semana+intervalo; FK companies incluída.

- [ ] **Task 1 — Entidade + migration `professional_schedules` (+ armazenamento do intervalo) (AC1)**
  - [ ] `database/entities/professional-schedule.entity.ts` (§3.6).
  - [ ] Migration nova (timestamp > `1718900300000`): cria `professional_schedules` (índice por `company_id`, FK `professional_id → users` **e** FK `company_id → companies`) **e** `ALTER TABLE users ADD slot_interval_minutes INT NOT NULL DEFAULT 0` (intervalo por profissional). `down` reverte tudo (drop coluna + drop tabela).
  - [ ] Registrar entidade(s)+migration em `data-source-options.ts`; incluir `professional_schedules` em `KNOWN_TABLES` (`test-db.ts`).
  - [ ] RED→GREEN: e2e de migration (espelhar `migration-services.e2e-spec.ts`): colunas, índice por `company_id`, FK(s), coluna de intervalo, reversão. (Lembrar: `information_schema.NON_UNIQUE` é string via TypeORM → `Number(...)`.)

- [ ] **Task 2 — `SchedulesModule` + repositório tenant-aware (AC2, AC3)**
  - [ ] `modules/schedules/{schedules.module.ts, schedules.controller.ts, schedules.service.ts, schedules.repository.ts, dto/*.dto.ts}`.
  - [ ] `ProfessionalSchedulesRepository extends TenantAwareRepository<ProfessionalSchedule>`. Importar `TenantModule` + `TypeOrmModule.forFeature([...])` + `UsersModule` (validar `attends_clients`). Prover `ActiveUserGuard` no módulo.
  - [ ] **Registrar `SchedulesController` em `TENANT_AWARE_CONTROLLERS`** (guard-rail 1.3.01).

- [ ] **Task 3 — Endpoints de configuração (AC2, AC3, AC4)**
  - [ ] `GET /api/schedules/:professionalId` (autenticado do tenant): retorna a semana (7 dias com faixa/ativo) + o intervalo do profissional.
  - [ ] `PUT /api/schedules/:professionalId` (`@Roles('owner')`): substitui a semana inteira + define o intervalo (`0–120` min). Valida `attends_clients=true` (senão 400) e `end_time > start_time` por dia ativo (AC4 → 400). Persiste tenant-scoped.
  - [ ] `TIME` I/O: aceitar `"HH:MM"`/`"HH:MM:SS"`; validar formato; comparar início/fim.
  - [ ] RED→GREEN e2e: Dono configura semana + intervalo; leitura retorna; não-Dono → 403; faixa inválida → 400; profissional não-atendente → erro.

- [ ] **Task 4 — Swagger dos endpoints novos (1.5.01)**
  - [ ] `@ApiTags('schedules')` + `@ApiBearerAuth()` no `SchedulesController`; DTOs auto-documentados pelo plugin. Conferir em `/api/docs` (dev).

- [ ] **Task 5 — Validação final (todas as ACs)**
  - [ ] Sequência CI em ambiente limpo, MySQL: `pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test` — verde, sem `--forceExit`, **guard-rail 1.3.01 verde** (SchedulesController coberto).
  - [ ] Conferir manualmente (compose + `/api/docs`): Dono configura horários e intervalo de um profissional; gestão/básico não configuram (403); faixa inválida barrada.

## Dev Notes

### Fronteiras de escopo — o que NÃO fazer

- **NÃO** implementar `AvailabilityService` nem geração/subtração de slots — é o Épico 2. Aqui só a **persistência** da configuração (horários + intervalo) para consumo futuro.
- **NÃO** criar `clients`/`appointments`/`payments` (Épico 2).
- **NÃO** quebrar regressões 1.1–1.5.01: login/refresh, `/users/*`, `/services/*`, isolamento A↔B, guard-rail, permissões, Swagger.
- **NÃO** adicionar controller tenant-aware sem registrar no guard-rail.

### Tenant-scoping e validações (reuso 1.3/1.4/1.5)

- `professional_schedules` encaixa em `TenantAwareRepository` (tem `id` + `company_id`). O "substituir a semana" = deletar as linhas do profissional (tenant-scoped) e inserir as novas (carimbando `company_id`).
- Validar profissional é do tenant e `attends_clients=true` reusando `UsersService.listAttenders()` (como na associação de serviços da 1.5).
- `day_of_week`: TINYINT 0=Dom..6=Sab (§3.6). Validar 0–6.
- `TIME` no MySQL/TypeORM volta como string `"HH:MM:SS"`. Comparar faixa via string `"HH:MM:SS"` funciona lexicograficamente, mas normalizar entrada para `HH:MM:SS` antes de comparar/salvar.

### Autorização (matriz FR-I2)

- `SchedulesController`: `@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)`; `PUT` com `@Roles('owner')`. `GET` sem `@Roles` (qualquer autenticado do tenant lê — útil para telas/agenda futuras).

### File structure (architecture.md §1, §4.6)

- `apps/api/src/database/entities/professional-schedule.entity.ts`
- `apps/api/src/database/migrations/<ts>-CreateProfessionalSchedules.ts` (+ intervalo) + registro em `data-source-options.ts`
- `apps/api/src/modules/schedules/{schedules.module.ts, schedules.controller.ts, schedules.service.ts, schedules.repository.ts, dto/*.dto.ts}`
- `apps/api/src/modules/tenant/tenant-aware-controllers.ts` (registrar `SchedulesController`)
- Testes: `apps/api/test/{schedules.e2e-spec.ts, migration-professional-schedules.e2e-spec.ts}`; `test/test-db.ts` (KNOWN_TABLES)

### Testing

- e2e (MySQL real, `--runInBand`, `jest.setTimeout(60000)`): PUT semana + intervalo (Dono); GET lê de volta; 403 não-Dono; 400 faixa inválida; 400 profissional não-atendente; migration aplica/reverte. Teardown limpo, sem `--forceExit`.
- Reusar `test/e2e-app.ts` e `test/test-db.ts`.

### Swagger (1.5.01)

- Ferramenta já configurada (dev-only, `/api/docs`). Documentar os endpoints de `schedules` com `@ApiTags`/`@ApiBearerAuth`; o plugin auto-documenta os DTOs e puxa os JSDoc como descrições.

### References

- [Source: epics.md#Story 1.6] — ACs (FR-G2, FR-G3, UX-DR13).
- [Source: prd.md#FR-G2] — dias + faixa por profissional; [#FR-G3] — intervalo entre agendamentos; [#FR-I2] — horários/intervalos = owner-only.
- [Source: architecture.md#3.6 professional_schedules] — schema/índice/FK; [#4.6 SchedulesModule] — responsabilidades e uso futuro no `AvailabilityService`; [#3.1 companies] — não há campo de intervalo hoje.
- [Source: ux-spec.md#Horarios de atendimento] — tela por profissional (dias, faixa, "Intervalo entre atendimentos", "Salvar" único).
- [Source: .decision-log.md#DL-020] — ordem de migrations; [#DL-022] — `attends_clients`; [#DL-028] — versionamento 1.6.NN.

### Decisões aprovadas (Renato, 2026-07-01 — ver DL-032)

1. **Intervalo POR PROFISSIONAL:** `users.slot_interval_minutes INT NOT NULL DEFAULT 0` (migration ALTER em `users`). A UX desenhou por profissional. **Nota:** se na prática o Dono achar trabalhoso configurar por pessoa, dá para simplificar para por-salão depois (`companies`) — não trava nada, é evolução (futuro 1.6.NN se necessário).
2. **Endpoint `PUT /api/schedules/:professionalId`** substituindo a **semana inteira + intervalo** num payload só (casa com o "Salvar" único da UX). `GET /api/schedules/:professionalId` para leitura.
3. **Adicionar FK `company_id → companies`** em `professional_schedules` (consistência com `salon_services`/`user_invites`), além da FK `professional_id → users`.
4. **Intervalo em minutos inteiros com faixa `0 ≤ x ≤ 120`** (`@IsInt @Min(0) @Max(120)`). Teto rejeita valores absurdos (3h = erro de digitação). Front usa dropdown; backend valida a faixa.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
