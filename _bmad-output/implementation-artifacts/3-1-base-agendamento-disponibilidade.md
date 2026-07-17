# Story 3.1: Base de agendamento — tabelas e cálculo de disponibilidade

Status: **review** (implementada; decisões D1–D7 aprovadas pelo Renato em 2026-07-16)

> **Épico 3 — Agendamento manual (painel), o núcleo vendável sem WhatsApp.** Esta é a
> **fundação de dados + disponibilidade**, extraída das antigas stories de bot (DL-035)
> para não ficar presa ao bot. Entrega: tabelas `clients` (base) e `appointments`
> (schema **completo**, pronto para o bot consumir depois sem migração) + o
> `AvailabilityService`. **Backend puro.** As telas (agenda, agendamento manual,
> cancelamento) são as Stories 3.2–3.4; o bot é o Épico 6.

## Story

As a desenvolvedor,
I want as tabelas de agendamento e o cálculo de disponibilidade prontos,
so that a agenda e o agendamento manual (e depois o bot) tenham base de dados e slots para operar.

## Acceptance Criteria

1. **(AC1 — Migration `clients` base)** Dada a migration desta story (ordem DL-020:
   `clients` **antes** de `appointments`), quando aplicada, então a tabela `clients` é
   criada com `id`, `company_id`, `name`, `phone_whatsapp`, `phone_whatsapp_normalized`,
   `notes`, `is_deleted`, timestamps; `UNIQUE (company_id, phone_whatsapp_normalized)`
   (NULL-safe) e índices liderados por `company_id`; FK `company_id → companies`. Reverte limpo.

2. **(AC2 — Migration `appointments`)** Dada a mesma migration, quando aplicada, então a
   tabela `appointments` é criada com o **schema completo** (architecture.md §3.7):
   `company_id`, `client_id` (FK), `service_id` (FK), `professional_id` (**nullable**, FK →
   `users`), `scheduled_at`, `duration_minutes` + `price_snapshot` (snapshots), `status`
   (enum), `source` (enum), `created_by_user_id` (nullable, FK), `cancellation_reason`,
   `cancelled_by` (enum), `timeout_notified_at`, `is_deleted`, timestamps; índices compostos
   liderados por `company_id` e as 5 FKs. Reverte limpo.

3. **(AC3 — Cálculo de disponibilidade)** Dado um serviço e uma data, quando o
   `AvailabilityService` calcula, então cruza `professional_schedules` + `professional_services`
   + `duration_minutes` do serviço + intervalo entre atendimentos (`users.slot_interval_minutes`,
   FR-G3) + `appointments` não-cancelados, gerando os slots livres; um slot existe se **≥1
   profissional que atende** está livre; respeita o `timezone` do tenant (ADR-008).

4. **(AC4 — Consulta pela API)** Dada a consulta de disponibilidade, quando o painel/API pede
   os horários de um dia (ou as próximas datas com vaga), então o serviço retorna as
   datas/horários disponíveis, **escopados por tenant**, para qualquer usuário autenticado do
   tenant. (Endpoints REST + Swagger.)

5. **(AC5 — Atomicidade preparada)** Dada a estratégia de atomicidade (NFR-C1, ADR-005), então
   o `AvailabilityService` expõe `hasAvailableSlot(...)` apto a ser chamado **dentro de uma
   transação com `SELECT ... FOR UPDATE`**, de forma que a criação concorrente pelo mesmo slot
   (Stories 3.3 manual / Épico 6 bot) resulte em exatamente 1 agendamento. *(A criação
   transacional em si depende da decisão D2 — ver §Decisões a aprovar.)*

## Pré-requisitos e contexto (Épico 1 + 2 no `main`, build limpo)

- **Multi-tenancy (1.3):** `TenantMiddleware` por controller via `TENANT_AWARE_CONTROLLERS`;
  `TenantAwareRepository<T>` injeta `WHERE company_id = ?`. **Guard-rail 1.3.01:** todo
  controller tenant-aware novo **precisa** entrar em `src/modules/tenant/tenant-aware-controllers.ts`
  — o guard-rail (`tenant-coverage.e2e-spec.ts`) falha se esquecer. Esta story adiciona o
  `AvailabilityController` → registrar lá.
- **Permissões (1.4):** `@UseGuards(JwtAuthGuard, ActiveUserGuard, RolesGuard)`; `@Roles('owner')`
  só em mutações. Aqui a consulta de disponibilidade é **leitura** → qualquer autenticado do
  tenant (sem `@Roles`), como o `GET` de `schedules`/`services`.
- **Dados que o cálculo cruza (já existem):**
  - `salon_services` (1.5): `duration_minutes`, `price` (`DECIMAL`→string, **nullable** DL-030), `is_active`.
  - `professional_services` (1.5): junção profissional↔serviço (quem executa o quê).
  - `professional_schedules` (1.6): `day_of_week` (0=Dom..6=Sab), `start_time`/`end_time` (`TIME`→"HH:MM:SS"), `is_active`.
  - `users` (1.4/1.6): `attends_clients` (quem entra na disponibilidade), `slot_interval_minutes` (0–120, DL-032).
  - `UsersService.listAttenders()` — fonte de quem atende (reuso 1.5/1.6).
- **Timezone (ADR-008):** o banco opera em **UTC** (`data-source-options.ts`, `timezone:"Z"`).
  `scheduled_at` é `DATETIME` **armazenado em UTC**; toda lógica de dia/horário lê
  `companies.timezone` (default `America/Sao_Paulo`) — nunca timezone global hardcoded.
- **Migrations:** padrão em `database/migrations/`; a última é `1718900400000-CreateProfessionalSchedules`.
  Registrar entidade(s)+migration em `data-source-options.ts`; incluir `appointments` e `clients`
  no `KNOWN_TABLES` do `test-db.ts` (drop FK-safe: `appointments` **antes** de `clients`/`users`/`salon_services`).
- **Swagger (1.5.01):** documentar os endpoints novos com `@ApiTags('availability')` + `@ApiBearerAuth()`.
- **Fluxo Git:** branch `story/3.1-base-agendamento-disponibilidade` (criada do `main` atualizado);
  commits pequenos; PR sem merge no fim (merge é do Renato). Versionamento: planejado `3.1`; ajuste fora de escopo `3.1.NN`.

## Modelo de dados

### `clients` (base mínima — enriquecida no Épico 4)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | BIGINT PK AI | |
| `company_id` | BIGINT NOT NULL | tenant; FK → `companies` |
| `name` | VARCHAR(100) NOT NULL | único obrigatório no cadastro (FR-E4) |
| `phone_whatsapp` | VARCHAR(20) NULL | como digitado |
| `phone_whatsapp_normalized` | VARCHAR(20) NULL | E.164 (`+5511…`) para matching/dedup |
| `notes` | TEXT NULL | observações livres (base; UI é Épico 4) |
| `is_deleted` | BOOLEAN NOT NULL DEFAULT FALSE | soft delete / LGPD (§3.11) |
| `created_at` / `updated_at` | TIMESTAMP | |

Índices: `UNIQUE (company_id, phone_whatsapp_normalized)` (NULL-safe: dois NULL não conflitam —
cliente sem WhatsApp é permitido), `(company_id, name)`, `(company_id, is_deleted)`.

> **Escopo (D7):** esta story cria a **tabela + entidade + repositório tenant-aware** de
> `clients`. **Sem** controller/CRUD de clientes aqui — o cadastro inline vem na 3.3 e a gestão
> completa (busca, e-mail, histórico) no Épico 4, que **estende** esta base.

### `appointments` (schema completo — pronto para o bot, sem migração futura)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | BIGINT PK AI | |
| `company_id` | BIGINT NOT NULL | FK → `companies` |
| `client_id` | BIGINT NOT NULL | FK → `clients` |
| `service_id` | BIGINT NOT NULL | FK → `salon_services` |
| `professional_id` | BIGINT **NULL** | FK → `users`. **Nullable desde já** (addendum C.4-bis): bot cria sem atribuir; manual atribui. |
| `scheduled_at` | DATETIME NOT NULL | início, **em UTC** (ADR-008) |
| `duration_minutes` | INT NOT NULL | snapshot do serviço no momento |
| `price_snapshot` | DECIMAL(10,2) **NULL** | snapshot do preço — **nullable** (ver D1) |
| `status` | ENUM(`pending`,`confirmed`,`cancelled`,`completed`,`no_show`) NOT NULL | |
| `source` | ENUM(`whatsapp`,`manual`,`app`) NOT NULL | rastreabilidade (FR-K1); `app` reservado |
| `created_by_user_id` | BIGINT NULL | FK → `users`; auditoria do criador manual (FR-K2); NULL quando bot |
| `cancellation_reason` | TEXT NULL | usado no cancelamento (3.4 / bot) |
| `cancelled_by` | ENUM(`client`,`professional`,`system`) NULL | |
| `timeout_notified_at` | DATETIME NULL | só o bot usa (Épico 6); criado agora para não migrar depois |
| `is_deleted` | BOOLEAN NOT NULL DEFAULT FALSE | soft delete / LGPD |
| `created_at` / `updated_at` | TIMESTAMP | |

Índices (todos liderados por `company_id`): `(company_id, scheduled_at)`, `(company_id, status, scheduled_at)`,
`(company_id, professional_id, scheduled_at)`, `(company_id, client_id)`, `(company_id, source)`.
FKs: `company`, `client`, `service`, `professional` (nullable), `created_by`.

**Estado inicial por origem (FR-K3):** `whatsapp` → `pending`; `manual` → `confirmed`; `app` reservado.
*(A **escrita** desses estados é das Stories 3.3/6.x; esta story só cria a estrutura.)*

**Máquina de estados (referência, implementada nas próximas stories):**
`pending → confirmed | cancelled`; `confirmed → completed | cancelled | no_show`.

## `AvailabilityService` — algoritmo

Assinatura proposta (ver D3):

```
getDaySlots({ companyId, serviceId, date, professionalId? }): TimeSlot[]
getNextAvailableDates({ companyId, serviceId, fromDate, days=5, professionalId? }): DateWithSlots[]
hasAvailableSlot({ companyId, serviceId, scheduledAt, professionalId?, excludeAppointmentIds? }): boolean
```

Passo a passo do `getDaySlots` (architecture.md §4.6):

1. Resolve o serviço → `duration_minutes`; se inativo/inexistente no tenant → `[]`.
2. **Candidatos:** usuários com `attends_clients = true` que **executam o serviço**
   (`professional_services`). Se `professionalId` informado, restringe a ele (validando que
   atende **e** executa o serviço); senão, considera todos.
3. `day_of_week` = dia da semana de `date` **no `timezone` do tenant**.
4. Para cada candidato: busca `professional_schedules` **ativos** daquele dia (faixas
   `start_time`/`end_time`) e o seu `slot_interval_minutes`.
5. **Gera a grade** de horários de início dentro de cada faixa (ver D4 para o passo), onde cada
   slot ocupa `[início, início + duration]` e cabe dentro de `end_time`.
6. **Subtrai ocupados:** remove os slots que sobrepõem `appointments` não-cancelados do
   candidato, aplicando o `slot_interval_minutes` como **buffer** após cada atendimento
   existente (um corte às 10:00/60min com intervalo 15 bloqueia até 11:15).
7. **Union por serviço:** o slot está disponível se **≥1 candidato** está livre nele (o retorno
   não revela qual profissional — FR-A3; no modo `professionalId` fixo, é a agenda daquele).
8. Converte os horários de volta ao `timezone` do tenant para exibição; internamente compara em UTC.

`getNextAvailableDates` itera os próximos `days` a partir de `fromDate` e retorna os que têm ≥1 slot
(o bot apresenta até 5 — FR-A2; o painel manual usa o mesmo motor).

## Atomicidade (NFR-C1 / ADR-005)

Estratégia (architecture.md §7.2): a **criação** de um agendamento roda numa transação MySQL que
primeiro faz `SELECT ... FOR UPDATE` (lock pessimista) nos `appointments` não-cancelados que
sobrepõem o slot-alvo do tenant; com as linhas travadas, chama `AvailabilityService.hasAvailableSlot`;
se ainda houver profissional livre, insere; senão lança `SlotUnavailableException`. Duas requisições
concorrentes pelo mesmo slot → a segunda espera o lock e recebe indisponível → exatamente 1 registro.

Esta story entrega o `hasAvailableSlot` pronto para esse uso e **documenta** a estratégia. Se a
**criação transacional** em si entra aqui ou na 3.3 depende de **D2**.

## Fronteiras de escopo — o que NÃO fazer

- **NÃO** construir o bot, `whatsapp_conversations`, nem a FK `appointment_id` (Épico 6).
- **NÃO** construir as telas (agenda 3.2, agendamento manual 3.3, cancelamento 3.4).
- **NÃO** criar controller/CRUD de `clients` (cadastro inline é 3.3; gestão é Épico 4).
- **NÃO** implementar confirmar/recusar/cancelar/pending-count nem BullMQ/timeout (Épico 6).
- **NÃO** quebrar regressões (login, `/users`, `/services`, `/schedules`, isolamento A↔B, guard-rail).
- **NÃO** adicionar controller tenant-aware sem registrar no guard-rail.

## Tasks / Subtasks

- [x] **Task 1 — Entidades + migration (`clients`, `appointments`) (AC1, AC2)**
  - [x] `database/entities/{client.entity.ts, appointment.entity.ts}` (§3.3/§3.7).
  - [x] `1718900500000-CreateAppointmentsBase.ts`: cria `clients` e depois `appointments`
        (ordem DL-020); `down` reverte na ordem inversa (appointments antes de clients).
  - [x] Registrado em `data-source-options.ts`; `KNOWN_TABLES` (`test-db.ts`) na ordem FK-safe.
  - [x] e2e de migration (`migration-appointments.e2e-spec.ts`): colunas, enums, índices, FKs,
        nullables, unicidade NULL-safe de `clients`, reversão.

- [x] **Task 2 — `ClientsModule` (base) (AC1, D7)**
  - [x] `ClientsRepository extends TenantAwareRepository<Client>` (sem controller).
        `phone.util.ts` (E.164) + unit (`phone.util.spec.ts`).

- [x] **Task 3 — `AvailabilityService` + módulo (AC3)**
  - [x] `modules/availability/{availability.module.ts, availability.service.ts, availability.controller.ts, dto/}`.
  - [x] Serviço/horários via repositórios **tenant-aware** (`SalonServicesRepository`,
        `ProfessionalSchedulesRepository`); demais leituras escopadas por `company_id`.
  - [x] `getDaySlots`, `getNextAvailableDates`, `hasAvailableSlot` (timezone do tenant).
  - [x] Lógica pura extraída para `slot.util.ts` + `tz.util.ts`, com **unit exaustivo** (29 casos):
        grade por duração, buffer de intervalo, união ≥1 profissional, `professionalId`, bordas, tz.

- [x] **Task 4 — Endpoints + guard-rail + Swagger (AC4)**
  - [x] `GET /api/availability` e `GET /api/availability/next-dates`.
  - [x] `AvailabilityController` em `TENANT_AWARE_CONTROLLERS` (guard-rail 1.3.01 verde).
  - [x] `@ApiTags('availability')` + `@ApiBearerAuth()`.
  - [x] e2e (`availability.e2e-spec.ts`): união, `professionalId`, isolamento A↔B, `hasAvailableSlot`.

- [x] **Task 5 — Atomicidade: motor + documentação (D2=A)** — `hasAvailableSlot` apto a rodar sob
  `SELECT ... FOR UPDATE` (aceita `excludeAppointmentIds`); a criação transacional fica na Story 3.3.

- [x] **Task 6 — Validação** — build/typecheck/lint verdes; **unit 62/62** (incl. guard-rail);
  boot da API + smoke HTTP (200/401/400). e2e novos rodam no CI (ver Completion Notes).

## Decisões aprovadas (Renato, 2026-07-16)

| # | Decisão | **Aprovado** |
|---|---|---|
| **D1** | `price_snapshot` — a arquitetura (§3.7) põe `NOT NULL`, mas serviço pode não ter preço (DL-030). | **Nullable** (`DECIMAL(10,2) NULL`) — serviço "sob consulta" precisa poder ser agendado. Desvio consciente da arch (registrar em `.decision-log.md`). |
| **D2** | Escopo da criação atômica nesta story. | **3.1 entrega o motor** (`hasAvailableSlot`) **+ a estratégia documentada**; a criação transacional (`FOR UPDATE`) fica na **Story 3.3**, com o primeiro criador real. |
| **D3** | `AvailabilityService` com `professionalId` opcional (serve manual **e** bot). | **Incluir** o parâmetro opcional desde já. |
| **D4** | Granularidade da grade + papel do intervalo. | Passo = **duração do serviço**; `slot_interval_minutes` entra como **buffer** após cada atendimento. Respeita o tempo real do serviço, não fragmenta a agenda. |
| **D5** | Criar o schema completo de `appointments` já agora (incl. colunas só do bot). | **Sim** — evita migração futura (filosofia C.4-bis). |
| **D6** | Rotas: `GET /api/availability` e `GET /api/availability/next-dates`, leitura para qualquer autenticado do tenant. | **Aprovado** como proposto. |
| **D7** | `clients` = tabela + entidade + repositório, sem controller/CRUD (cadastro inline é 3.3; gestão é Épico 4). | **Aprovado** — recorte confirmado. |

## References

- [Source: epics.md#Story 3.1] — ACs (base extraída, DL-035); [#Épico 3] — escopo do núcleo vendável.
- [Source: architecture.md#3.3 clients] / [#3.7 appointments] — schemas, FKs, índices, enums.
- [Source: architecture.md#4.6 SchedulesModule / AvailabilityService] — algoritmo de disponibilidade.
- [Source: architecture.md#4.7 AppointmentsModule] — ciclo de vida, permissões por `access_level`.
- [Source: architecture.md#7 Atomicidade] / [#ADR-005] — `SELECT FOR UPDATE`; [#ADR-008] — timezone por tenant.
- [Source: prd.md#FR-D, FR-K, FR-I2] — agenda/origem/permissões; [#FR-A3] — slot = ≥1 profissional livre.
- [Source: .decision-log.md#DL-020] — ordem de migrations; [#DL-022] — dois eixos; [#DL-030] — preço opcional; [#DL-023] — no_show; [#DL-035] — repriorização manual-first; [#addendum C.4-bis] — `professional_id` nullable.

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (Amelia)

### Completion Notes
- **Backend puro**, sem telas/bot. Tabelas `clients` (base) + `appointments` (schema completo,
  D5) + `AvailabilityService`. `professional_id` e `price_snapshot` nullable (C.4-bis / D1).
- **Lógica delicada isolada e testada à exaustão:** a matemática de slots (`slot.util.ts`) e o
  fuso (`tz.util.ts`) são funções puras com **29 testes unit** — grade por duração, buffer de
  intervalo (gap simétrico), união ≥1 profissional, bordas de faixa, round-trip de timezone.
- **Guard-rail 1.3.01:** o `AvailabilityService` passou a consumir `SalonServicesRepository` e
  `ProfessionalSchedulesRepository` (tenant-aware) — além de mais seguro (escopo automático), é o
  que o guard-rail detecta para exigir o `TenantMiddleware`. Demais leituras (professional_services,
  users, appointments, companies) são escopadas manualmente por `company_id`.
- **Atomicidade (D2):** `hasAvailableSlot` aceita `excludeAppointmentIds` para rodar dentro da
  transação com `FOR UPDATE` — a criação transacional é da Story 3.3.
- **Validação:** build/typecheck/lint verdes; **unit 62/62** (inclui guard-rail + slot/tz/phone).
  Boot da API + smoke HTTP real: `GET /api/availability` → 200 (com token), 401 (sem), 400 (data inválida).
- **e2e (migration + disponibilidade):** escritos (`migration-appointments.e2e-spec.ts`,
  `availability.e2e-spec.ts`). **Não rodaram localmente** por um problema de ambiente pré-existente
  (jest + mysql2 no Windows: `this.mysql.createPool is not a function` / `cesu8` — o `health.e2e`
  existente falha igual). Rodam no **CI (Linux)**. Um banco `tamarcado_test` isolado (3307) foi usado
  para não tocar dados de dev.

### File List
**Database**
- `entities/client.entity.ts`, `entities/appointment.entity.ts` (novos)
- `migrations/1718900500000-CreateAppointmentsBase.ts` (novo); `data-source-options.ts`; `test/test-db.ts`

**Clients (`modules/clients`)** — `clients.module.ts`, `clients.repository.ts`, `phone.util.ts` (+ `.spec.ts`)

**Availability (`modules/availability`)** — `availability.module.ts`, `availability.controller.ts`,
`availability.service.ts`, `dto/availability-query.dto.ts`, `slot.util.ts` (+ `.spec.ts`),
`tz.util.ts` (+ `.spec.ts`)

**Wiring** — `app.module.ts` (ClientsModule + AvailabilityModule); `modules/tenant/tenant-aware-controllers.ts`

**Testes** — `test/migration-appointments.e2e-spec.ts`, `test/availability.e2e-spec.ts` (novos)

**Docs** — esta spec; `.decision-log.md` (DL-038); `architecture.md` §3.7 (`price_snapshot` nullable)
